from django.db import models
from django.contrib.auth.models import AbstractUser
from society.models import Society, Block, Flat


class User(AbstractUser):
    ROLE_CHOICES = (
        ("ADMIN", "Admin"),
        ("RESIDENT", "Resident"),
        ("GUARDIAN", "Guardian"),
        ("VOLUNTEER", "Volunteer"),
        ("SECURITY", "Security"),
    )

    VOLUNTEER_STATUS_CHOICES = (
        ("AVAILABLE", "Available"),
        ("BUSY", "Busy"),
        ("OFFLINE", "Offline"),
    )

    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    phone = models.CharField(max_length=15, unique=True)
    address = models.TextField(blank=True)
    is_verified = models.BooleanField(default=False)
    volunteer_status = models.CharField(max_length=20, choices=VOLUNTEER_STATUS_CHOICES, default="OFFLINE")
    profile_photo = models.ImageField(upload_to="profiles/", blank=True, null=True)

    society = models.ForeignKey(Society, on_delete=models.SET_NULL, null=True, blank=True)
    block = models.ForeignKey(Block, on_delete=models.SET_NULL, null=True, blank=True)
    flat = models.ForeignKey(Flat, on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return self.username

    @property
    def is_platform_admin(self):
        return bool(self.is_authenticated and self.is_superuser and self.role == "ADMIN")


class Guardian(models.Model):
    GUARDIAN_TYPE_CHOICES = [
        ("PRIMARY", "Primary Guardian"),
        ("SECONDARY", "Secondary Guardian"),
        ("EMERGENCY", "Emergency Contact"),
    ]

    resident = models.ForeignKey(User, on_delete=models.CASCADE, related_name="guardians")
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="guardian_links")
    name = models.CharField(max_length=100)
    relation = models.CharField(max_length=50)
    phone = models.CharField(max_length=15)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    guardian_type = models.CharField(max_length=20, choices=GUARDIAN_TYPE_CHOICES, default="EMERGENCY")
    is_verified = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    RELATIONSHIP_STATUS_CHOICES = [
        ("PENDING", "Pending Acceptance"),
        ("ACCEPTED", "Accepted"),
        ("DECLINED", "Declined"),
        ("CANCELLED", "Cancelled"),
        ("REVOKED", "Revoked"),
    ]
    relationship_status = models.CharField(max_length=12, choices=RELATIONSHIP_STATUS_CHOICES, default="PENDING")
    requested_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="guardian_requests_created")
    created_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    declined_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.name} - {self.guardian_type} ({self.relation})"


class ResponderMembershipRequest(models.Model):
    DIRECTION_CHOICES = [("REQUEST", "Responder Requested Access"), ("INVITE", "Admin Invited Responder")]
    STATUS_CHOICES = [("PENDING", "Pending"), ("ACCEPTED", "Accepted"), ("DECLINED", "Declined"), ("CANCELLED", "Cancelled")]
    ROLE_CHOICES = [("SECURITY", "Security"), ("VOLUNTEER", "Volunteer")]
    responder = models.ForeignKey(User, on_delete=models.CASCADE, related_name="responder_membership_requests")
    society = models.ForeignKey(Society, on_delete=models.CASCADE, related_name="responder_membership_requests")
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="PENDING")
    requested_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="responder_membership_requests_created")
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class PhoneOTP(models.Model):
    PURPOSE_CHOICES = [
        ("REGISTER", "Registration"),
        ("GUARDIAN", "Guardian Verification"),
        ("LOGIN", "Login"),
        ("RESET", "Password Reset"),
    ]

    phone = models.CharField(max_length=15)
    otp_code = models.CharField(max_length=6)
    purpose = models.CharField(max_length=20, choices=PURPOSE_CHOICES, default="REGISTER")
    is_verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"OTP for {self.phone} ({self.purpose}) - {self.otp_code}"

    def is_valid(self):
        from django.utils import timezone
        return not self.is_verified and timezone.now() <= self.expires_at

