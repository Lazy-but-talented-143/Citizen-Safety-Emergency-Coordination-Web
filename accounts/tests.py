from django.test import TestCase
from accounts.models import User

class UserModelTest(TestCase):
    def test_password_hashing(self):
        u = User.objects.create_user(username="demo", password="demo123", role="RESIDENT", phone="9111111111")
        self.assertTrue(u.check_password("demo123"))
        self.assertNotEqual(u.password, "demo123")
