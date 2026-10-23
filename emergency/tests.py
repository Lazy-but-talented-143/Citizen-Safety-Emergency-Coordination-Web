from django.test import TestCase
from accounts.models import User
from emergency.models import Emergency

class EmergencyModelTest(TestCase):
    def test_defaults(self):
        u = User.objects.create_user(username="resident", password="x", role="RESIDENT", phone="9222222222")
        e = Emergency.objects.create(user=u, location="Block A")
        self.assertEqual(e.status, "PENDING")
        self.assertEqual(e.priority, "HIGH")
