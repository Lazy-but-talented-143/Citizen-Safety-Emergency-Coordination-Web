"""
Citizen Safety – Emergency Escalation Engine
============================================
Strict chain: PRIMARY → SECONDARY → EMERGENCY → SECURITY → VOLUNTEER → PENDING

Rules
-----
* A responder DECLINE / CANCEL / NO_RESPONSE must NEVER terminate the emergency.
* Every transition is recorded via AuditLog.
* Only the background worker (process_escalations) drives timed advances.
* Frontend may trigger process_emergency_escalation to advance a *manually*
  initiated decline/cancel, but MUST NOT trigger it on every page load.
"""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework import status

from accounts.models import Guardian, User, ResponderMembershipRequest
from emergency.models import Emergency, EmergencyEscalation, Notification, AuditLog


import os

_DEFAULT_WAIT = int(os.getenv("ESCALATION_WAIT_SECONDS", "30"))
GUARDIAN_WAIT_SECONDS = int(os.getenv("GUARDIAN_WAIT_SECONDS", str(_DEFAULT_WAIT)))
SECURITY_WAIT_SECONDS = int(os.getenv("SECURITY_WAIT_SECONDS", str(_DEFAULT_WAIT)))
VOLUNTEER_WAIT_SECONDS = int(os.getenv("VOLUNTEER_WAIT_SECONDS", str(_DEFAULT_WAIT)))
PENDING_CLOSE_HOURS = int(os.getenv("PENDING_CLOSE_HOURS", "6"))
HANDOVER_WAIT_SECONDS = int(os.getenv("HANDOVER_WAIT_SECONDS", str(_DEFAULT_WAIT)))
ADDITIONAL_HELP_WAIT_SECONDS = int(os.getenv("ADDITIONAL_HELP_WAIT_SECONDS", str(_DEFAULT_WAIT)))

# contact_types that belong to the main escalation chain
CHAIN_TYPES = {"PRIMARY", "SECONDARY", "EMERGENCY", "SECURITY", "VOLUNTEER", "PENDING"}
# contact_types that are auxiliary (must NOT advance the chain when they expire)
AUX_TYPES = {"HANDOVER", "ADDITIONAL_HELP"}


def _deadline(seconds=GUARDIAN_WAIT_SECONDS):
    return timezone.now() + timedelta(seconds=seconds)


def _audit(emergency, actor, action, details=""):
    return AuditLog.objects.create(
        emergency=emergency, actor=actor, action=action, details=details
    )


def _notify(user, emergency, title, message):
    """Create an in-app notification and push to WebSocket layer."""
    n = Notification.objects.create(
        user=user, emergency=emergency, title=title, message=message
    )
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        layer = get_channel_layer()
        if layer:
            async_to_sync(layer.group_send)(
                f"notifications_{user.id}",
                {
                    "type": "notification_message",
                    "payload": {
                        "id": n.id,
                        "title": title,
                        "message": message,
                        "emergency": emergency.id,
                    },
                },
            )
    except Exception:
        pass
    return n


# ──────────────────────────────────────────────────────────────────────────────
# Stage creators
# ──────────────────────────────────────────────────────────────────────────────

def _guardian_stage(emergency, kind):
    """
    Create a WAITING escalation for a guardian type if one exists and is
    eligible.  Returns the escalation or None.
    """
    guardian = Guardian.objects.filter(
        resident=emergency.user,
        guardian_type=kind,
        is_active=True,
        is_verified=True,
        relationship_status="ACCEPTED",
    ).first()
    if not guardian:
        return None
    esc = EmergencyEscalation.objects.create(
        emergency=emergency,
        contact_type=kind,
        guardian=guardian,
        responder=guardian.user,
        response_status="WAITING",
        response_deadline=_deadline(GUARDIAN_WAIT_SECONDS),
    )
    if guardian.user_id:
        _notify(
            guardian.user,
            emergency,
            f"Emergency Alert – {kind.title()} Guardian",
            f"Emergency #{emergency.id} needs your urgent response at {emergency.location}.",
        )
    _audit(emergency, None, f"{kind}_NOTIFIED",
           f"{kind.title()} guardian {guardian.name} notified.")
    return esc


def _security_stage(emergency):
    """Notify all eligible, available security personnel in the society."""
    from django.db.models import Q
    users = (
        User.objects.filter(
            role="SECURITY",
            is_active=True,
            is_verified=True,
            volunteer_status="AVAILABLE",
            society_id=emergency.user.society_id,
        )
        .filter(
            Q(responder_membership_requests__society=emergency.user.society,
              responder_membership_requests__role="SECURITY",
              responder_membership_requests__status="ACCEPTED")
            | Q(society=emergency.user.society)
        )
        .distinct()
        .order_by("id")
    )
    if not users.exists():
        return None, 0
    esc = EmergencyEscalation.objects.create(
        emergency=emergency,
        contact_type="SECURITY",
        response_status="WAITING",
        response_deadline=_deadline(SECURITY_WAIT_SECONDS),
    )
    for u in users:
        _notify(
            u,
            emergency,
            "Emergency Alert – Security",
            (
                f"Emergency #{emergency.id} requires security response at "
                f"{emergency.location}. GPS: {emergency.latitude}, {emergency.longitude}."
            ),
        )
    _audit(emergency, None, "SECURITY_NOTIFIED",
           f"{users.count()} security personnel notified.")
    return esc, users.count()


def _volunteer_stage(emergency):
    """Notify all eligible, available volunteers in the society."""
    from django.db.models import Q
    users = (
        User.objects.filter(
            role="VOLUNTEER",
            is_active=True,
            is_verified=True,
            volunteer_status="AVAILABLE",
            society_id=emergency.user.society_id,
        )
        .filter(
            Q(responder_membership_requests__society=emergency.user.society,
              responder_membership_requests__role="VOLUNTEER",
              responder_membership_requests__status="ACCEPTED")
            | Q(society=emergency.user.society)
        )
        .distinct()
        .order_by("id")
    )
    if not users.exists():
        return None, 0
    esc = EmergencyEscalation.objects.create(
        emergency=emergency,
        contact_type="VOLUNTEER",
        response_status="WAITING",
        response_deadline=_deadline(VOLUNTEER_WAIT_SECONDS),
    )
    for u in users:
        _notify(
            u,
            emergency,
            "Emergency Alert – Volunteer",
            (
                f"Emergency #{emergency.id} is available for volunteer response at "
                f"{emergency.location}. GPS: {emergency.latitude}, {emergency.longitude}."
            ),
        )
    _audit(emergency, None, "VOLUNTEER_NOTIFIED",
           f"{users.count()} volunteers notified.")
    return esc, users.count()


def _pending_stage(emergency):
    """Move emergency to the open community queue."""
    users = (
        User.objects.filter(
            is_active=True,
            is_verified=True,
            society_id=emergency.user.society_id,
            role__in=["SECURITY", "VOLUNTEER"],
            responder_membership_requests__society=emergency.user.society,
            responder_membership_requests__role__in=["SECURITY", "VOLUNTEER"],
            responder_membership_requests__status="ACCEPTED",
        )
        .exclude(id=emergency.user_id)
        .distinct()
    )
    esc = EmergencyEscalation.objects.create(
        emergency=emergency,
        contact_type="PENDING",
        response_status="WAITING",
        response_deadline=None,
    )
    for u in users.iterator():
        _notify(
            u,
            emergency,
            "Emergency Open to Community",
            (
                f"Emergency #{emergency.id} received no response from the primary "
                "escalation chain. A verified Security or Volunteer responder may "
                "accept it."
            ),
        )
    count = users.count()
    _audit(emergency, None, "PENDING_COMMUNITY",
           f"No escalation chain responder responded. {count} community members notified.")
    return esc, count


# ──────────────────────────────────────────────────────────────────────────────
# Chain helpers
# ──────────────────────────────────────────────────────────────────────────────

def _next_chain_stage(emergency, after_type):
    """
    Given the stage that just expired/declined, create the next stage.
    Returns (escalation_or_None, description).
    """
    order = ["PRIMARY", "SECONDARY", "EMERGENCY", "SECURITY", "VOLUNTEER", "PENDING"]
    try:
        idx = order.index(after_type)
    except ValueError:
        # Unknown type – fall through to security as a safe default
        idx = 2  # start from SECURITY

    # Walk forward until we find a stage that can be created
    for next_type in order[idx + 1 :]:
        if next_type in {"PRIMARY", "SECONDARY", "EMERGENCY"}:
            esc = _guardian_stage(emergency, next_type)
            if esc:
                return esc, next_type
            # No guardian of this type – skip to next
            continue
        if next_type == "SECURITY":
            esc, count = _security_stage(emergency)
            if esc:
                return esc, "SECURITY"
            continue
        if next_type == "VOLUNTEER":
            esc, count = _volunteer_stage(emergency)
            if esc:
                return esc, "VOLUNTEER"
            continue
        if next_type == "PENDING":
            esc, count = _pending_stage(emergency)
            return esc, "PENDING"

    # Should not reach here, but create PENDING as a safety net
    esc, _ = _pending_stage(emergency)
    return esc, "PENDING"


def start_emergency_escalation(emergency):
    """
    Start the chain from the beginning.
    PRIMARY → SECONDARY → EMERGENCY → SECURITY → VOLUNTEER → PENDING
    Only the *first available* stage is created; subsequent stages are created
    when the current stage expires, declines, or cancels.
    """
    for kind in ("PRIMARY", "SECONDARY", "EMERGENCY"):
        esc = _guardian_stage(emergency, kind)
        if esc:
            return esc

    esc, _ = _security_stage(emergency)
    if esc:
        return esc

    esc, _ = _volunteer_stage(emergency)
    if esc:
        return esc

    esc, _ = _pending_stage(emergency)
    return esc


def advance_from(emergency, declined_type, actor=None, reason="DECLINED"):
    """
    Called when a responder declines, cancels, or times out.
    Creates the next stage in the chain and returns it.
    This ensures the emergency is NEVER terminated by a responder action.
    """
    _audit(emergency, actor, f"{declined_type}_{reason}",
           f"{declined_type} responded with {reason}. Advancing escalation chain.")
    esc, next_type = _next_chain_stage(emergency, declined_type)
    return esc, next_type


# ──────────────────────────────────────────────────────────────────────────────
# Background-worker entry point
# ──────────────────────────────────────────────────────────────────────────────

@transaction.atomic
def process_emergency_escalation(emergency_id):
    """
    Advance the escalation for a single emergency.
    Called by the background worker when a deadline has passed, and
    optionally by the frontend after a manual decline/cancel.

    IMPORTANT: Only processes CHAIN_TYPES.  AUX_TYPES (HANDOVER,
    ADDITIONAL_HELP) are handled separately and must NOT advance the chain.
    """
    try:
        emergency = (
            Emergency.objects.select_for_update()
            .select_related("user", "user__society")
            .get(id=emergency_id)
        )
    except Emergency.DoesNotExist:
        return {"error": "Emergency not found."}, status.HTTP_404_NOT_FOUND

    if emergency.status in {"RESOLVED", "CANCELLED", "AUTO_CLOSED"}:
        return {"message": "Emergency is closed."}, status.HTTP_200_OK

    # If an escalation is already accepted, nothing to advance
    if emergency.escalations.filter(
        response_status="ACCEPTED",
        contact_type__in=CHAIN_TYPES,
    ).exists():
        return {"message": "Emergency escalation already accepted."}, status.HTTP_200_OK

    current = (
        emergency.escalations.select_for_update()
        .filter(response_status="WAITING", contact_type__in=CHAIN_TYPES)
        .order_by("-created_at")
        .first()
    )

    if not current:
        # No waiting chain escalation — check if we need to start one
        last_chain = (
            emergency.escalations
            .filter(contact_type__in=CHAIN_TYPES)
            .order_by("-created_at")
            .first()
        )
        if last_chain and last_chain.response_status in {"DECLINED", "CANCELLED"}:
            # Advance from where the chain stalled
            esc, next_type = advance_from(emergency, last_chain.contact_type, reason="STALLED")
            return {
                "message": f"Chain was stalled. Advanced to {next_type}.",
                "current_stage": next_type,
            }, status.HTTP_200_OK
        return {"message": "No waiting chain escalation found."}, status.HTTP_200_OK

    # ── PENDING stage: check 6-hour auto-close ────────────────────────────────
    if current.contact_type == "PENDING":
        age = timezone.now() - current.created_at
        if age >= timedelta(hours=PENDING_CLOSE_HOURS):
            emergency.status = "AUTO_CLOSED"
            emergency.save(update_fields=["status"])
            current.response_status = "NO_RESPONSE"
            current.responded_at = timezone.now()
            current.save(update_fields=["response_status", "responded_at"])
            _audit(emergency, None, "AUTO_CLOSED",
                   f"Pending emergency exceeded {PENDING_CLOSE_HOURS}-hour closure window.")
            _notify(
                emergency.user,
                emergency,
                "Emergency Auto-Closed",
                f"Emergency #{emergency.id} was auto-closed after "
                f"{PENDING_CLOSE_HOURS} hours without a responder.",
            )
            return {
                "message": "Emergency auto-closed after the pending window.",
                "current_stage": "AUTO_CLOSED",
            }, status.HTTP_200_OK

        seconds_left = max(
            0,
            int(
                (timedelta(hours=PENDING_CLOSE_HOURS) - age).total_seconds()
            ),
        )
        return {
            "message": "Emergency is open in the pending community queue.",
            "current_stage": "PENDING",
            "response_status": "WAITING",
            "seconds_remaining": seconds_left,
        }, status.HTTP_200_OK

    # ── Main chain: check deadline ────────────────────────────────────────────
    now = timezone.now()
    if current.response_deadline and now < current.response_deadline:
        return {
            "message": "Waiting for response.",
            "current_stage": current.contact_type,
            "response_status": current.response_status,
            "seconds_remaining": max(
                0, int((current.response_deadline - now).total_seconds())
            ),
        }, status.HTTP_200_OK

    # Deadline expired – mark NO_RESPONSE and advance
    current.response_status = "NO_RESPONSE"
    current.responded_at = now
    current.save(update_fields=["response_status", "responded_at"])

    esc, next_type = advance_from(
        emergency, current.contact_type, reason="NO_RESPONSE"
    )
    return {
        "message": f"{current.contact_type} timed out. Advanced to {next_type}.",
        "previous_stage": current.contact_type,
        "previous_status": "NO_RESPONSE",
        "current_stage": next_type,
        "response_deadline": getattr(esc, "response_deadline", None),
    }, status.HTTP_200_OK


@transaction.atomic
def process_auxiliary_escalation(emergency_id):
    """
    Handle expired HANDOVER / ADDITIONAL_HELP requests.
    These must NEVER advance the main escalation chain.
    """
    try:
        emergency = Emergency.objects.select_for_update().get(id=emergency_id)
    except Emergency.DoesNotExist:
        return

    now = timezone.now()
    expired = (
        emergency.escalations.select_for_update()
        .filter(
            contact_type__in=AUX_TYPES,
            response_status="WAITING",
            response_deadline__lte=now,
        )
    )
    for esc in expired:
        esc.response_status = "NO_RESPONSE"
        esc.responded_at = now
        esc.save(update_fields=["response_status", "responded_at"])
        _audit(
            emergency,
            None,
            f"{esc.contact_type}_EXPIRED",
            f"{esc.contact_type} request expired without acceptance. "
            "Original responder remains responsible.",
        )


# Public aliases for command scripts / seeding
security_stage = _security_stage

