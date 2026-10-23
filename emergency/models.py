from django.db import models
from django.conf import settings


class Emergency(models.Model):
    EMERGENCY_TYPES = (
        ("HEART_ATTACK", "Heart Attack / Chest Pain"),
        ("BREATHING", "Breathing Problem"),
        ("LOW_BP", "Low BP / Dizziness"),
        ("FALL", "Fall / Injury"),
        ("UNCONSCIOUS", "Unconscious / Fainting"),
        ("FIRE", "Fire"),
        ("SECURITY", "Security Threat"),
        ("ACCIDENT", "Accident"),
        ("MEDICAL", "Medical"),
        ("THEFT", "Theft"),
        ("OTHER", "Other Emergency"),
    )
    STATUS = (
        ("PENDING", "Pending"),
        ("ASSIGNED", "Assigned"),
        ("IN_PROGRESS", "In Progress"),
        ("RESOLVED", "Resolved"),
        ("CANCELLED", "Cancelled by Resident"),
        ("AUTO_CLOSED", "Auto-Closed"),
    )
    PRIORITY_CHOICES = (
        ("LOW", "Low"),
        ("MEDIUM", "Medium"),
        ("HIGH", "High"),
        ("CRITICAL", "Critical"),
    )

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="emergencies")
    emergency_type = models.CharField(max_length=20, choices=EMERGENCY_TYPES, default="OTHER")
    description = models.TextField(default="Emergency triggered using SOS button.")
    location = models.CharField(max_length=255, default="Location unavailable")
    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    category_auto_selected = models.BooleanField(default=False)
    category_selected_at = models.DateTimeField(null=True, blank=True)
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default="HIGH")
    status = models.CharField(max_length=20, choices=STATUS, default="PENDING")
    assigned_security = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="security_cases")
    assigned_volunteer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="volunteer_cases")
    accepted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    reached_at = models.DateTimeField(null=True, blank=True)
    assistance_started_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    closure_note = models.TextField(blank=True)
    additional_responders = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name="additional_emergency_cases")

    def __str__(self):
        return f"Emergency #{self.id} - {self.user.username} - {self.emergency_type}"


class EmergencyEscalation(models.Model):
    CONTACT_TYPES = (
        ("PRIMARY", "Primary Guardian"),
        ("SECONDARY", "Secondary Guardian"),
        ("EMERGENCY", "Emergency Contact"),
        ("SECURITY", "Security"),
        ("VOLUNTEER", "Volunteer"),
        ("PENDING", "Open Pending Queue"),
        ("HANDOVER", "Handover Request"),
        ("ADDITIONAL_HELP", "Additional Help"),
    )
    RESPONSE_STATUS = (
        ("WAITING", "Waiting for Response"),
        ("ACCEPTED", "Accepted"),
        ("DECLINED", "Declined"),
        ("NO_RESPONSE", "No Response"),
        ("CANCELLED", "Cancelled"),
    )
    emergency = models.ForeignKey(Emergency, on_delete=models.CASCADE, related_name="escalations")
    contact_type = models.CharField(max_length=20, choices=CONTACT_TYPES)
    guardian = models.ForeignKey("accounts.Guardian", on_delete=models.SET_NULL, null=True, blank=True, related_name="emergency_escalations")
    responder = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="emergency_escalation_responses")
    response_status = models.CharField(max_length=20, choices=RESPONSE_STATUS, default="WAITING")
    notified_at = models.DateTimeField(auto_now_add=True)
    response_deadline = models.DateTimeField(null=True, blank=True)
    responded_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.CharField(max_length=100, null=True, blank=True)
    cancel_comment = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class Notification(models.Model):
    CHANNEL_CHOICES = (("IN_APP", "In App"), ("EMAIL", "Email"), ("SMS", "SMS"), ("PUSH", "Push"))
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    emergency = models.ForeignKey(Emergency, on_delete=models.CASCADE, null=True, blank=True)
    title = models.CharField(max_length=100)
    message = models.TextField()
    channel = models.CharField(max_length=10, choices=CHANNEL_CHOICES, default="IN_APP")
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class AuditLog(models.Model):
    emergency = models.ForeignKey(Emergency, on_delete=models.CASCADE, related_name="audit_logs")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    action = models.CharField(max_length=100)
    details = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class ResponderLocation(models.Model):
    responder = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="live_location")
    latitude = models.DecimalField(max_digits=10, decimal_places=7)
    longitude = models.DecimalField(max_digits=10, decimal_places=7)
    updated_at = models.DateTimeField(auto_now=True)


class ChatMessage(models.Model):
    emergency = models.ForeignKey(Emergency, on_delete=models.CASCADE, related_name="chat_messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="emergency_chat_messages")
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
