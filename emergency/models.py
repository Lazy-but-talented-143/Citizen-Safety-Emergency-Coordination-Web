from django.db import models
from django.conf import settings


class Emergency(models.Model):

    EMERGENCY_TYPES = (
        ("MEDICAL", "Medical"),
        ("FIRE", "Fire"),
        ("THEFT", "Theft"),
        ("ACCIDENT", "Accident"),
        ("OTHER", "Other"),
    )

    STATUS = (
        ("PENDING", "Pending"),
        ("ASSIGNED", "Assigned"),
        ("IN_PROGRESS", "In Progress"),
        ("RESOLVED", "Resolved"),
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="emergencies"
    )

    emergency_type = models.CharField(
        max_length=20,
        choices=EMERGENCY_TYPES
    )

    description = models.TextField()

    location = models.CharField(max_length=255)

    status = models.CharField(
        max_length=20,
        choices=STATUS,
        default="PENDING"
    )

    assigned_security = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="security_cases"
    )

    assigned_volunteer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="volunteer_cases"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    
    assistance_started_at = models.DateTimeField(
        null=True,
        blank=True
    )

    resolved_at = models.DateTimeField(
        null=True,
        blank=True
    )

    def __str__(self):
        return f"{self.user.username} - {self.emergency_type}"
class Notification(models.Model):

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE
    )

    emergency = models.ForeignKey(
        Emergency,
        on_delete=models.CASCADE
    )

    title = models.CharField(max_length=100)

    message = models.TextField()

    is_read = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title