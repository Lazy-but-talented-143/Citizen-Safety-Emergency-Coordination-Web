"""
Citizen Safety – Automatic Escalation Worker
============================================
Runs as a continuous background process.

Handles:
  • Main chain:  PRIMARY → SECONDARY → EMERGENCY → SECURITY → VOLUNTEER → PENDING
    120-second timeout per stage; 6-hour auto-close for PENDING.

  • Auxiliary:   HANDOVER and ADDITIONAL_HELP requests.
    Expired requests are marked NO_RESPONSE; the original responder stays
    responsible.  The main escalation chain is NEVER advanced by auxiliary
    expiry.

One broken emergency must never stop the worker.
"""

import time

from django.core.management.base import BaseCommand
from django.db import models
from django.utils import timezone

from emergency.models import EmergencyEscalation
from api.services.escalation import (
    process_emergency_escalation,
    process_auxiliary_escalation,
    CHAIN_TYPES,
    AUX_TYPES,
)


class Command(BaseCommand):
    help = "Continuously process expired emergency escalation deadlines."

    def add_arguments(self, parser):
        parser.add_argument(
            "--interval",
            type=float,
            default=1.0,
            help="Polling interval in seconds (default: 1.0)",
        )

    def handle(self, *args, **options):
        interval = max(0.5, options["interval"])
        self.stdout.write(
            self.style.SUCCESS("Automatic escalation worker started. Press Ctrl+C to stop.")
        )

        try:
            while True:
                now = timezone.now()

                # ── Chain escalations that have expired ────────────────────────
                chain_ids = list(
                    EmergencyEscalation.objects.filter(
                        response_status="WAITING",
                        contact_type__in=CHAIN_TYPES,
                    )
                    .filter(
                        models.Q(response_deadline__isnull=False, response_deadline__lte=now)
                        | models.Q(
                            contact_type="PENDING",
                            created_at__lte=now
                            - __import__("datetime").timedelta(hours=6),
                        )
                    )
                    .values_list("emergency_id", flat=True)
                    .distinct()
                )

                for eid in chain_ids:
                    try:
                        result, _ = process_emergency_escalation(eid)
                        self.stdout.write(
                            f"[chain] Emergency #{eid}: {result.get('message', 'Processed')}"
                        )
                    except Exception as exc:
                        self.stderr.write(
                            self.style.ERROR(
                                f"[chain] Emergency #{eid} failed: {exc}"
                            )
                        )

                # ── Auxiliary (HANDOVER / ADDITIONAL_HELP) ─────────────────────
                aux_ids = list(
                    EmergencyEscalation.objects.filter(
                        response_status="WAITING",
                        contact_type__in=AUX_TYPES,
                        response_deadline__lte=now,
                    )
                    .values_list("emergency_id", flat=True)
                    .distinct()
                )

                for eid in aux_ids:
                    try:
                        process_auxiliary_escalation(eid)
                        self.stdout.write(
                            f"[aux]   Emergency #{eid}: auxiliary request expired."
                        )
                    except Exception as exc:
                        self.stderr.write(
                            self.style.ERROR(
                                f"[aux]   Emergency #{eid} auxiliary failed: {exc}"
                            )
                        )

                time.sleep(interval)

        except KeyboardInterrupt:
            self.stdout.write(self.style.WARNING("Worker stopped."))
