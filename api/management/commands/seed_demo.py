from django.core.management.base import BaseCommand
from accounts.models import User, Guardian, ResponderMembershipRequest
from society.models import Society, Block, Flat
from emergency.models import Emergency, EmergencyEscalation, ChatMessage, AuditLog, Notification
from django.utils import timezone
from datetime import timedelta
from api.services.escalation import start_emergency_escalation, _security_stage, _deadline


class Command(BaseCommand):
    help = "Populate complete, comprehensive demo dataset with rich accounts across all roles and states."

    def ensure_society(self, name, address, city, state, pincode, block_names):
        society, _ = Society.objects.get_or_create(
            name=name,
            defaults={"address": address, "city": city, "state": state, "pincode": pincode},
        )
        for block_name in block_names:
            block, _ = Block.objects.get_or_create(society=society, name=block_name)
            for n in ["101", "102", "103", "201", "202", "301"]:
                Flat.objects.get_or_create(block=block, flat_number=n, defaults={"floor": int(n[0])})
        return society

    def ensure_user(self, username, role, phone, first_name, last_name, society=None, block=None, flat=None, available=False, is_super=False):
        user, _ = User.objects.get_or_create(username=username, defaults={"role": role, "phone": phone})
        user.role = role
        user.phone = phone
        user.first_name = first_name
        user.last_name = last_name
        user.email = f"{username}@citizensafe.org"
        user.society = society
        user.block = block
        user.flat = flat
        user.is_verified = True
        user.is_superuser = is_super
        user.is_staff = is_super
        user.volunteer_status = "AVAILABLE" if available else "OFFLINE"
        user.set_password(f"{username}123")
        user.save()
        return user

    def handle(self, *args, **options):
        # 1. Ensure primary society and secondary society
        green = self.ensure_society(
            "Green Valley Residency", "100 Outer Ring Road", "Vijayawada",
            "Andhra Pradesh", "520001", ["Block A", "Block B", "Block C"]
        )
        blue = self.ensure_society(
            "Blue Horizon Heights", "45 Marine Drive", "Visakhapatnam",
            "Andhra Pradesh", "530002", ["Tower 1", "Tower 2"]
        )

        bA = Block.objects.get(society=green, name="Block A")
        bB = Block.objects.get(society=green, name="Block B")
        f101 = Flat.objects.get(block=bA, flat_number="101")
        f102 = Flat.objects.get(block=bA, flat_number="102")
        f201 = Flat.objects.get(block=bB, flat_number="201")

        # 2. Comprehensive Users across all platform roles
        # Platform Admin (Global Superuser)
        self.ensure_user("platform_admin", "ADMIN", "9999900099", "Platform", "Director", None, None, None, False, True)

        # Society Admin
        self.ensure_user("admin", "ADMIN", "9999900001", "Rajesh", "Sharma", green, bA, None, False, False)

        # Second Society Admin
        self.ensure_user("admin2", "ADMIN", "9999900002", "Anand", "Verma", blue, None, None, False, False)

        # Residents
        siva = self.ensure_user("siva", "RESIDENT", "9876500001", "Siva", "Kumar", green, bA, f101, False, False)
        priya = self.ensure_user("priya", "RESIDENT", "9876500002", "Priya", "Nair", green, bA, f102, False, False)
        rahul = self.ensure_user("rahul", "RESIDENT", "9876500003", "Rahul", "Reddy", green, bB, f201, False, False)

        # Guardians
        p1 = self.ensure_user("primary1", "GUARDIAN", "9876500011", "Ramesh", "Kumar", green, bA, f101, False, False)
        s1 = self.ensure_user("secondary1", "GUARDIAN", "9876500012", "Lakshmi", "Devi", green, bA, f101, False, False)
        e1 = self.ensure_user("emergency1", "GUARDIAN", "9876500013", "Suresh", "Kumar", green, bA, f101, False, False)

        # Security Responders
        sec1 = self.ensure_user("security1", "SECURITY", "9876500021", "Mahesh", "Singh", green, bA, None, True, False)
        sec2 = self.ensure_user("security2", "SECURITY", "9876500022", "Kiran", "Yadav", green, bB, None, True, False)

        # Volunteer Responders
        vol1 = self.ensure_user("volunteer1", "VOLUNTEER", "9876500031", "Vikram", "Rao", green, bA, None, True, False)
        vol2 = self.ensure_user("volunteer2", "VOLUNTEER", "9876500032", "Sneha", "Patel", green, bB, None, True, False)

        # 3. Responder Memberships Approved
        for u in [sec1, sec2, vol1, vol2]:
            ResponderMembershipRequest.objects.update_or_create(
                responder=u, society=green, role=u.role,
                defaults={
                    "direction": "INVITE",
                    "status": "ACCEPTED",
                    "requested_by": None,
                    "responded_at": timezone.now(),
                },
            )

        # 4. Link Guardians to Resident Siva
        guardians_meta = [
            (p1, "Ramesh Kumar", "Father", "PRIMARY"),
            (s1, "Lakshmi Devi", "Mother", "SECONDARY"),
            (e1, "Suresh Kumar", "Brother", "EMERGENCY"),
        ]
        for g_user, g_name, g_rel, g_kind in guardians_meta:
            Guardian.objects.update_or_create(
                resident=siva,
                guardian_type=g_kind,
                defaults={
                    "user": g_user,
                    "name": g_name,
                    "relation": g_rel,
                    "phone": g_user.phone,
                    "email": g_user.email,
                    "address": "Green Valley Residency, Block A",
                    "is_verified": True,
                    "is_active": True,
                    "relationship_status": "ACCEPTED",
                    "requested_by": siva,
                },
            )

        # 5. Populate Realistic Test Emergencies
        Emergency.objects.all().delete()
        ChatMessage.objects.all().delete()
        AuditLog.objects.all().delete()
        Notification.objects.all().delete()

        # Emergency 1: Active Escalation with Siva -> Primary Guardian WAITING (with fast 30s deadline)
        em1 = Emergency.objects.create(
            user=siva,
            emergency_type="MEDICAL",
            description="Severe breathing difficulty and chest pain reported in Flat 101.",
            location="Block A - Flat 101, Floor 1",
            latitude=16.5062,
            longitude=80.6480,
            priority="CRITICAL",
            status="PENDING",
            category_auto_selected=False,
            created_at=timezone.now(),
        )
        AuditLog.objects.create(emergency=em1, actor=siva, action="SOS_CREATED", details="Medical SOS alert triggered by resident.")
        start_emergency_escalation(em1)

        # Emergency 2: Security Assigned & In-Progress with Live Chat
        em2 = Emergency.objects.create(
            user=priya,
            emergency_type="SECURITY",
            description="Suspicious unauthorized intruder spotted on staircase between Floor 1 and 2.",
            location="Block A - Staircase Floor 1",
            latitude=16.5065,
            longitude=80.6482,
            priority="HIGH",
            status="IN_PROGRESS",
            assigned_security=sec1,
            accepted_at=timezone.now() - timedelta(minutes=5),
            reached_at=timezone.now() - timedelta(minutes=3),
            assistance_started_at=timezone.now() - timedelta(minutes=2),
            category_auto_selected=False,
        )
        AuditLog.objects.create(emergency=em2, actor=priya, action="SOS_CREATED", details="Security alert triggered.")
        AuditLog.objects.create(emergency=em2, actor=sec1, action="SECURITY_ACCEPTED", details="Guard Mahesh Singh accepted the incident.")
        AuditLog.objects.create(emergency=em2, actor=sec1, action="LOCATION_REACHED", details="Security responder reached Block A staircase.")
        AuditLog.objects.create(emergency=em2, actor=sec1, action="ASSISTANCE_STARTED", details="Security investigation in progress.")

        # Seed realistic chat messages for Incident 2
        ChatMessage.objects.create(emergency=em2, sender=priya, message="Security, please hurry. Someone is checking apartment doors.")
        ChatMessage.objects.create(emergency=em2, sender=sec1, message="I am at the Block A entrance now. Heading up the stairs immediately.")
        ChatMessage.objects.create(emergency=em2, sender=priya, message="Thank you! Please stay safe.")
        ChatMessage.objects.create(emergency=em2, sender=sec1, message="Floor 1 secured. Inspecting the upper corridor.")

        # Emergency 3: Resolved Incident with Closure Note
        em3 = Emergency.objects.create(
            user=rahul,
            emergency_type="FIRE",
            description="Small kitchen electrical fire extinguished using hallway dry-powder extinguisher.",
            location="Block B - Flat 201, Floor 2",
            latitude=16.5068,
            longitude=80.6485,
            priority="MEDIUM",
            status="RESOLVED",
            assigned_volunteer=vol1,
            accepted_at=timezone.now() - timedelta(hours=2),
            reached_at=timezone.now() - timedelta(hours=1, minutes=50),
            assistance_started_at=timezone.now() - timedelta(hours=1, minutes=45),
            resolved_at=timezone.now() - timedelta(hours=1, minutes=30),
            closure_note="Fire contained and main circuit breaker tripped safely. No structural damage.",
            category_auto_selected=False,
        )
        AuditLog.objects.create(emergency=em3, actor=rahul, action="SOS_CREATED", details="Fire alert triggered.")
        AuditLog.objects.create(emergency=em3, actor=vol1, action="VOLUNTEER_ACCEPTED", details="Volunteer Vikram Rao accepted incident.")
        AuditLog.objects.create(emergency=em3, actor=vol1, action="RESOLVED", details="Resolved with closure note.")

        self.stdout.write(self.style.SUCCESS("Complete dummy dataset loaded successfully with all roles, guardians, active escalation, and live chats!"))
