from django.core.management.base import BaseCommand
from accounts.models import User, Guardian, ResponderMembershipRequest
from society.models import Society, Block, Flat
from emergency.models import Emergency
from django.utils import timezone
from api.services.escalation import security_stage


class Command(BaseCommand):
    help = "Create/reset single-society (Green Valley Residency) demo data."

    def ensure_society(self, name, address, city, state, pincode, block_names):
        society, _ = Society.objects.get_or_create(
            name=name,
            defaults={"address": address, "city": city, "state": state, "pincode": pincode},
        )
        for block_name in block_names:
            block, _ = Block.objects.get_or_create(society=society, name=block_name)
            for n in ["101", "102", "201", "202"]:
                Flat.objects.get_or_create(block=block, flat_number=n, defaults={"floor": int(n[0])})
        return society

    def ensure_user(self, username, role, phone, society, block=None, flat=None, available=False):
        user, _ = User.objects.get_or_create(username=username, defaults={"role": role, "phone": phone})
        user.role = role
        user.phone = phone
        user.society = society
        user.block = block
        user.flat = flat
        user.is_verified = True
        user.is_superuser = (username == "platform_admin")
        user.is_staff = (username == "platform_admin")
        user.volunteer_status = "AVAILABLE" if available else "OFFLINE"
        user.set_password(f"{username}123")
        user.save()
        return user

    def handle(self, *args, **options):
        allowed_users = {"siva", "primary1", "secondary1", "emergency1", "security1", "volunteer1", "admin", "platform_admin"}
        User.objects.exclude(username__in=allowed_users).delete()
        Society.objects.exclude(name="Green Valley Residency").delete()

        green = self.ensure_society(
            "Green Valley Residency", "Block A community", "Vijayawada",
            "Andhra Pradesh", "520001", ["Block A", "Block B"]
        )

        green_a = Block.objects.get(society=green, name="Block A")
        green_flat = Flat.objects.get(block=green_a, flat_number="101")

        demos = [
            ("admin", "ADMIN", "9999900001", green, green_a, None, False),
            ("siva", "RESIDENT", "9876500001", green, green_a, green_flat, False),
            ("primary1", "GUARDIAN", "9876500011", green, green_a, green_flat, False),
            ("secondary1", "GUARDIAN", "9876500012", green, green_a, green_flat, False),
            ("emergency1", "GUARDIAN", "9876500013", green, green_a, green_flat, False),
            ("security1", "SECURITY", "9876500021", green, green_a, None, True),
            ("volunteer1", "VOLUNTEER", "9876500031", green, green_a, None, True),
        ]
        for row in demos:
            self.ensure_user(*row)

        for username, role in [
            ("security1", "SECURITY"),
            ("volunteer1", "VOLUNTEER"),
        ]:
            responder = User.objects.get(username=username)
            ResponderMembershipRequest.objects.update_or_create(
                responder=responder, society=green, role=role,
                defaults={
                    "direction": "INVITE",
                    "status": "ACCEPTED",
                    "requested_by": None,
                    "responded_at": timezone.now(),
                },
            )

        platform_admin = self.ensure_user("platform_admin", "ADMIN", "9999900099", None, None, None, False)
        platform_admin.society = None
        platform_admin.save()

        resident = User.objects.get(username="siva")
        for username, name, relation, kind in [
            ("primary1", "Ramesh", "Father", "PRIMARY"),
            ("secondary1", "Lakshmi", "Mother", "SECONDARY"),
            ("emergency1", "Suresh", "Brother", "EMERGENCY"),
        ]:
            g_user = User.objects.get(username=username)
            guardian, _ = Guardian.objects.update_or_create(
                resident=resident,
                guardian_type=kind,
                defaults={
                    "user": g_user, "name": name, "relation": relation,
                    "phone": g_user.phone, "email": f"{username}@gmail.com",
                    "address": "Vijayawada", "is_verified": True, "is_active": True, "relationship_status": "ACCEPTED", "requested_by": resident,
                },
            )
            g_user.first_name = name
            g_user.save(update_fields=["first_name"])

        Emergency.objects.exclude(user=resident).delete()
        demo_emergency = Emergency.objects.filter(
            user=resident,
            description="Demo security incident for dashboard walkthrough.",
        ).first()

        if not demo_emergency:
            demo_emergency = Emergency.objects.create(
                user=resident,
                emergency_type="SECURITY",
                description="Demo security incident for dashboard walkthrough.",
                location="Block A - Flat 101",
                latitude=16.6989322,
                longitude=80.7972102,
                priority="HIGH",
                category_auto_selected=False,
                status="PENDING",
            )
        else:
            demo_emergency.status = "PENDING"
            demo_emergency.assigned_security = None
            demo_emergency.assigned_volunteer = None
            demo_emergency.accepted_at = None
            demo_emergency.save(update_fields=["status", "assigned_security", "assigned_volunteer", "accepted_at"])
            demo_emergency.escalations.all().delete()

        security_stage(demo_emergency)

        self.stdout.write(self.style.SUCCESS(
            "Demo data successfully updated to single society (Green Valley Residency). Demo passwords follow username+123."
        ))
