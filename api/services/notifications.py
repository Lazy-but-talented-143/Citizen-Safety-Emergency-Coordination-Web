"""
Citizen Safety – Notification Delivery
=======================================
* IN_APP  – always created; pushed via WebSocket in views.notify()
* EMAIL   – sent if Django email backend is configured beyond console
* SMS     – sent via Twilio if credentials are configured; NOT faked
* PUSH    – NOT implemented (no service worker); do not fake delivery

Delivery status is set ONLY when actual external delivery occurs.
"""

import base64
import os
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone


def send_email_notification(user, title, message):
    """Return True only if an email was actually dispatched."""
    if not getattr(user, "email", None):
        return False
    # The default console backend does not constitute real delivery.
    backend = getattr(settings, "EMAIL_BACKEND", "")
    if "console" in backend or "dummy" in backend or "locmem" in backend:
        return False
    try:
        send_mail(
            title,
            message,
            getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@citizensafety.local"),
            [user.email],
            fail_silently=False,
        )
        return True
    except Exception:
        return False


def send_sms_notification(user, message):
    """
    Return True ONLY when Twilio credentials are configured and the API
    call succeeds.  Never fake success when credentials are absent.
    """
    phone = getattr(user, "phone", None)
    if not phone:
        return False

    sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    sender = os.getenv("TWILIO_FROM_NUMBER", "").strip()

    if not (sid and token and sender):
        # Credentials not configured – record notification but do NOT claim delivery.
        return False

    try:
        endpoint = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
        payload = urlencode({"To": phone, "From": sender, "Body": message}).encode()
        auth = base64.b64encode(f"{sid}:{token}".encode()).decode()
        req = Request(
            endpoint,
            data=payload,
            headers={"Authorization": f"Basic {auth}"},
            method="POST",
        )
        with urlopen(req, timeout=10) as resp:
            return 200 <= resp.status < 300
    except Exception:
        return False


def send_push_notification(user, title, message):
    """
    Browser Web Push is NOT implemented (no service worker registered).
    Do NOT return True – that would falsely mark notifications as delivered.
    The WebSocket layer in views.notify() provides real-time in-app delivery.
    """
    return False


def mark_delivered(notification):
    """Stamp delivered_at only when actual external delivery occurred."""
    notification.delivered_at = timezone.now()
    notification.save(update_fields=["delivered_at"])
