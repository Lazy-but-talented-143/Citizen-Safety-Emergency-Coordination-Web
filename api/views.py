from rest_framework import generics, viewsets, status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import api_view, permission_classes, action

from django.utils import timezone
from django.db import models

from accounts.models import User, Guardian
from society.models import Society, Block, Flat
from emergency.models import Emergency, Notification

from .permissions import (
    IsAdmin,
    IsResident,
    IsSecurity,
    IsVolunteer,
    IsAdminOrSecurity,
)

from .serializers import (
    UserSerializer,
    SocietySerializer,
    BlockSerializer,
    FlatSerializer,
    GuardianSerializer,
    EmergencySerializer,
    NotificationSerializer,
)


# ============================================================
# REGISTER API
# ============================================================

class RegisterUserView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [AllowAny]


# ============================================================
# PROFILE API
# ============================================================

class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)


# ============================================================
# VOLUNTEER STATUS API
# ============================================================

class VolunteerStatusView(APIView):
    permission_classes = [IsAuthenticated, IsVolunteer]

    def patch(self, request):
        volunteer = request.user

        new_status = request.data.get("volunteer_status")

        allowed_statuses = [
            "AVAILABLE",
            "BUSY",
            "OFFLINE",
        ]

        if new_status not in allowed_statuses:
            return Response(
                {
                    "error": "Invalid volunteer status.",
                    "allowed_statuses": allowed_statuses,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        volunteer.volunteer_status = new_status
        volunteer.save(
            update_fields=["volunteer_status"]
        )

        return Response(
            {
                "message": "Volunteer status updated successfully.",
                "user_id": volunteer.id,
                "username": volunteer.username,
                "volunteer_status": volunteer.volunteer_status,
            },
            status=status.HTTP_200_OK,
        )

# ============================================================
# SOCIETY API
# ============================================================

class SocietyViewSet(viewsets.ModelViewSet):
    queryset = Society.objects.all()
    serializer_class = SocietySerializer
    permission_classes = [IsAdmin]


# ============================================================
# BLOCK API
# ============================================================

class BlockViewSet(viewsets.ModelViewSet):
    queryset = Block.objects.all()
    serializer_class = BlockSerializer
    permission_classes = [IsAdmin]


# ============================================================
# FLAT API
# ============================================================

class FlatViewSet(viewsets.ModelViewSet):
    queryset = Flat.objects.all()
    serializer_class = FlatSerializer
    permission_classes = [IsAdmin]


# ============================================================
# GUARDIAN API
# ============================================================

class GuardianViewSet(viewsets.ModelViewSet):
    queryset = Guardian.objects.all()
    serializer_class = GuardianSerializer
    permission_classes = [IsAdmin]


# ============================================================
# EMERGENCY API
# ============================================================

class EmergencyViewSet(viewsets.ModelViewSet):
    queryset = Emergency.objects.all()
    serializer_class = EmergencySerializer
    permission_classes = [IsAuthenticated]

    # --------------------------------------------------------
    # Emergency permissions
    # --------------------------------------------------------

    def get_permissions(self):

        # Only residents can create emergencies
        if self.action == "create":
            permission_classes = [
                IsAuthenticated,
                IsResident,
            ]

        # Only Admin/Security can assign or resolve
        elif self.action in ["assign", "resolve"]:
            permission_classes = [
                IsAuthenticated,
                IsAdminOrSecurity,
            ]

        # Only volunteers can accept incidents
        elif self.action in ["accept", "start_assistance"]:
            permission_classes = [
                IsAuthenticated,
                IsVolunteer,
            ]

        else:
            permission_classes = [
                IsAuthenticated,
            ]

        return [
            permission()
            for permission in permission_classes
        ]

    # --------------------------------------------------------
    # Emergency visibility
    # --------------------------------------------------------

    def get_queryset(self):
        user = self.request.user

        # Admin can see every emergency
        if user.role == "ADMIN":
            return Emergency.objects.all()

        # Resident can see only their own emergencies
        elif user.role == "RESIDENT":
            return Emergency.objects.filter(
                user=user
            )

        # Security can see emergencies from their society
        elif user.role == "SECURITY":

            if user.society:
                return Emergency.objects.filter(
                    user__society=user.society
                )

            return Emergency.objects.none()

        # Volunteer can see incidents assigned to them
        # Volunteer can see:
        # 1. Emergencies assigned to them
        # 2. Pending emergencies for which they received notification
        elif user.role == "VOLUNTEER":

            notified_emergency_ids = Notification.objects.filter(
                user=user
            ).values_list(
                "emergency_id",
                flat=True
            )

            return Emergency.objects.filter(
                models.Q(assigned_volunteer=user) |
                models.Q(
                    id__in=notified_emergency_ids,
                    status="PENDING"
                )
            ).distinct().order_by("-created_at")

    # --------------------------------------------------------
    # Create Emergency
    # --------------------------------------------------------

    def perform_create(self, serializer):
        serializer.save(
            user=self.request.user
        )

    # --------------------------------------------------------
    # Assign Emergency
    # ADMIN / SECURITY
    # --------------------------------------------------------

    @action(
        detail=True,
        methods=["patch"],
        permission_classes=[
            IsAuthenticated,
            IsAdminOrSecurity
        ]
    )
    def assign(self, request, pk=None):

        emergency = self.get_object()

        security_id = request.data.get(
            "assigned_security"
        )

        volunteer_id = request.data.get(
            "assigned_volunteer"
        )

        if security_id:
            emergency.assigned_security = (
                User.objects.get(
                    id=security_id
                )
            )

        if volunteer_id:
            emergency.assigned_volunteer = (
                User.objects.get(
                    id=volunteer_id
                )
            )

        emergency.status = "ASSIGNED"

        emergency.save()

        return Response(
            self.get_serializer(
                emergency
            ).data
        )

    # --------------------------------------------------------
    # Volunteer Accept Emergency
    # --------------------------------------------------------

    @action(
        detail=True,
        methods=["patch"],
        permission_classes=[
            IsAuthenticated,
            IsVolunteer
        ]
    )
    def accept(self, request, pk=None):

        try:
            emergency = Emergency.objects.get(
                pk=pk
            )

        except Emergency.DoesNotExist:

            return Response(
                {
                    "error": "Emergency not found."
                },
                status=status.HTTP_404_NOT_FOUND
            )

        volunteer = request.user

        # Volunteer must have received notification for this emergency
        has_notification = Notification.objects.filter(
            user=volunteer,
            emergency=emergency
        ).exists()

        if not has_notification:
            return Response(
                {
                    "error": "You were not notified about this emergency."
                },
                status=status.HTTP_403_FORBIDDEN
            )

        # Volunteer must be AVAILABLE
        if volunteer.volunteer_status != "AVAILABLE":
            return Response(
                {
                    "error": "You must be AVAILABLE to accept an emergency."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # Resolved emergency cannot be accepted
        if emergency.status == "RESOLVED":

            return Response(
                {
                    "error":
                    "Resolved emergency cannot be accepted."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # Emergency cannot already have a volunteer
        if emergency.assigned_volunteer is not None:

            return Response(
                {
                    "error":
                    "Emergency already has an assigned volunteer."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # Assign volunteer
        emergency.assigned_volunteer = volunteer

        # Change emergency status
        emergency.status = "ASSIGNED"

        emergency.save(
            update_fields=[
                "assigned_volunteer",
                "status",
            ]
        )

        # Volunteer becomes BUSY
        volunteer.volunteer_status = "BUSY"

        volunteer.save(
            update_fields=[
                "volunteer_status"
            ]
        )

        return Response(
            {
                "message":
                "Emergency accepted successfully.",

                "emergency_id":
                emergency.id,

                "assigned_volunteer":
                volunteer.id,

                "volunteer_status":
                volunteer.volunteer_status,

                "emergency_status":
                emergency.status,
            },
            status=status.HTTP_200_OK
        )

    # --------------------------------------------------------
    # Volunteer Start Assistance
    # --------------------------------------------------------

    @action(
        detail=True,
        methods=["patch"],
        url_path="start-assistance",
        permission_classes=[
            IsAuthenticated,
            IsVolunteer
        ]
    )
    def start_assistance(self, request, pk=None):

        volunteer = request.user

        try:
            emergency = Emergency.objects.get(pk=pk)

        except Emergency.DoesNotExist:
            return Response(
                {
                    "error": "Emergency not found."
                },
                status=status.HTTP_404_NOT_FOUND
            )

        # Emergency must be assigned to this volunteer
        if emergency.assigned_volunteer != volunteer:
            return Response(
                {
                    "error":
                    "This emergency is not assigned to you."
                },
                status=status.HTTP_403_FORBIDDEN
            )

        # Assistance can start only after assignment
        if emergency.status != "ASSIGNED":
            return Response(
                {
                    "error":
                    "Assistance can only be started for an assigned emergency."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        emergency.status = "IN_PROGRESS"
        emergency.assistance_started_at = timezone.now()

        emergency.save(
            update_fields=[
                "status",
                "assistance_started_at",
            ]
        )

        return Response(
            {
                "message":
                "Assistance started successfully.",
                "emergency_id":
                emergency.id,
                "emergency_status":
                emergency.status,
                "assistance_started_at":
                emergency.assistance_started_at,
                "assigned_volunteer":
                volunteer.id,
            },
            status=status.HTTP_200_OK
        )

    # --------------------------------------------------------
    # Resolve Emergency
    # ADMIN / SECURITY
    # --------------------------------------------------------

    @action(
        detail=True,
        methods=["patch"],
        permission_classes=[
            IsAuthenticated,
            IsAdminOrSecurity
        ]
    )
    def resolve(self, request, pk=None):

        emergency = self.get_object()

        # Prevent resolving the same emergency twice
        if emergency.status == "RESOLVED":
            return Response(
                {
                    "error": "Emergency is already resolved."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # Store assigned volunteer before resolving
        volunteer = emergency.assigned_volunteer

        # Resolve emergency
        emergency.status = "RESOLVED"
        emergency.resolved_at = timezone.now()

        emergency.save(
            update_fields=[
                "status",
                "resolved_at",
            ]
        )

        # Release volunteer after incident is closed
        if volunteer:
            volunteer.volunteer_status = "AVAILABLE"

            volunteer.save(
                update_fields=[
                    "volunteer_status"
                ]
            )

        return Response(
            {
                "message": "Emergency resolved successfully.",
                "emergency": self.get_serializer(emergency).data,
                "volunteer_status": (
                    volunteer.volunteer_status
                    if volunteer
                    else None
                ),
            },
            status=status.HTTP_200_OK
        )

# ============================================================
# NOTIFICATION API
# ============================================================

class NotificationViewSet(viewsets.ModelViewSet):
    queryset = Notification.objects.all()
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):

        if self.request.user.role == "ADMIN":
            return Notification.objects.all()

        return Notification.objects.filter(
            user=self.request.user
        )


# ============================================================
# DASHBOARD API
# ============================================================

@api_view(["GET"])
@permission_classes([
    IsAuthenticated,
    IsAdmin
])
def dashboard(request):

    data = {
        "total_users":
            User.objects.count(),

        "total_societies":
            Society.objects.count(),

        "total_guardians":
            Guardian.objects.count(),

        "total_emergencies":
            Emergency.objects.count(),

        "pending_emergencies":
            Emergency.objects.filter(
                status="PENDING"
            ).count(),

        "assigned_emergencies":
            Emergency.objects.filter(
                status="ASSIGNED"
            ).count(),

        "resolved_emergencies":
            Emergency.objects.filter(
                status="RESOLVED"
            ).count(),

        "total_notifications":
            Notification.objects.count(),
    }

    return Response(data)


# ============================================================
# SOS API
# ============================================================

@api_view(["POST"])
@permission_classes([
    IsAuthenticated,
    IsResident
])
def sos(request):

    resident = request.user

    emergency = Emergency.objects.create(
        user=resident,
        emergency_type="OTHER",
        description="Emergency triggered using SOS button.",
        location=request.data.get(
            "location",
            "Unknown"
        ),
        status="PENDING",
    )

    # --------------------------------------------------------
    # Notify Resident
    # --------------------------------------------------------

    Notification.objects.create(
        user=resident,
        emergency=emergency,
        title="SOS Triggered",
        message="Your emergency request has been created.",
    )

    # --------------------------------------------------------
    # Find Available Volunteers
    # --------------------------------------------------------

    available_volunteers = User.objects.filter(
        role="VOLUNTEER",
        volunteer_status="AVAILABLE"
    )

    # If resident belongs to a society,
    # notify volunteers from the same society
    if resident.society:
        available_volunteers = available_volunteers.filter(
            society=resident.society
        )

    # --------------------------------------------------------
    # Notify Available Volunteers
    # --------------------------------------------------------

    volunteer_notifications = []

    for volunteer in available_volunteers:

        notification = Notification.objects.create(
            user=volunteer,
            emergency=emergency,
            title="New Emergency",
            message=(
                f"A new {emergency.emergency_type} emergency "
                f"has been reported at {emergency.location}."
            ),
        )

        volunteer_notifications.append(notification.id)

    return Response(
        {
            "message": "SOS sent successfully.",
            "emergency_id": emergency.id,
            "volunteers_notified": len(
                volunteer_notifications
            ),
        },
        status=status.HTTP_201_CREATED,
    )