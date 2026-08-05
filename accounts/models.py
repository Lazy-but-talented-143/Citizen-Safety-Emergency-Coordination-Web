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
    volunteer_status = models.CharField(
        max_length=20,
        choices=VOLUNTEER_STATUS_CHOICES,
        default="OFFLINE"
    )

    society = models.ForeignKey(
        Society,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )

    block = models.ForeignKey(
        Block,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )

    flat = models.ForeignKey(
        Flat,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )

    def __str__(self):
        return self.username
class Guardian(models.Model):

    resident = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="guardians"
    )

    name = models.CharField(max_length=100)

    relation = models.CharField(max_length=50)

    phone = models.CharField(max_length=15)

    email = models.EmailField(blank=True)

    address = models.TextField(blank=True)

    def __str__(self):
        return f"{self.name} ({self.relation})"