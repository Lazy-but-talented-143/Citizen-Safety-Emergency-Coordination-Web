from datetime import timedelta
import secrets
import string
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db import models, transaction
from django.db.models import Avg, Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.http import urlsafe_base64_decode
from rest_framework import generics, viewsets, status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from rest_framework.views import APIView

from accounts.models import User, Guardian, ResponderMembershipRequest, PhoneOTP
from society.models import Society, Block, Flat
from emergency.models import Emergency, Notification, EmergencyEscalation, AuditLog, ResponderLocation, ChatMessage
from api.permissions import IsAdmin, IsResident, IsSecurity, IsVolunteer, IsAdminOrSecurity
from api.serializers import (
    UserSerializer, SocietySerializer, BlockSerializer, FlatSerializer, GuardianSerializer,
    EmergencySerializer, NotificationSerializer, AuditLogSerializer, ResponderLocationSerializer, ChatMessageSerializer,
)
from api.services.escalation import process_emergency_escalation
from api.services.notifications import send_email_notification, send_sms_notification, send_push_notification, mark_delivered
from api.services.platform import is_platform_admin, scoped_society_id, ensure_admin_scope


def responder_membership_approved(user, society_id=None):
    if not user or user.role not in {"SECURITY", "VOLUNTEER"} or not user.is_active or not user.is_verified:
        return False
    sid = society_id if society_id is not None else user.society_id
    return ResponderMembershipRequest.objects.filter(responder=user, society_id=sid, role=user.role, status="ACCEPTED").exists()



# ---------------------------- health checks ----------------------------
@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request):
    """Liveness probe: verifies basic service responsiveness."""
    return Response({
        "status": "healthy",
        "service": "Citizen Safety Platform API",
        "timestamp": timezone.now().isoformat(),
    })


@api_view(["GET"])
@permission_classes([AllowAny])
def readiness_check(request):
    """Readiness probe: verifies database connectivity and channel layer health."""
    checks = {}
    is_ready = True

    # Database check
    try:
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"error: {str(e)}"
        is_ready = False

    # Channel layer check
    try:
        from channels.layers import get_channel_layer
        layer = get_channel_layer()
        if layer:
            checks["channel_layer"] = "ok"
        else:
            checks["channel_layer"] = "disabled"
    except Exception as e:
        checks["channel_layer"] = f"error: {str(e)}"

    status_code = status.HTTP_200_OK if is_ready else status.HTTP_503_SERVICE_UNAVAILABLE
    return Response({
        "status": "ready" if is_ready else "degraded",
        "checks": checks,
        "timestamp": timezone.now().isoformat(),
    }, status=status_code)


# ---------------------------- helpers ----------------------------
def audit(emergency, actor, action_name, details=""):
    return AuditLog.objects.create(emergency=emergency, actor=actor, action=action_name, details=details)


def notify(user, emergency, title, message, channel="IN_APP"):
    n = Notification.objects.create(user=user, emergency=emergency, title=title, message=message, channel=channel)
    delivered = False
    if channel == "EMAIL":
        delivered = send_email_notification(user, title, message)
    elif channel == "SMS":
        delivered = send_sms_notification(user, message)
    elif channel == "PUSH":
        delivered = send_push_notification(user, title, message)
    else:
        delivered = True
    if delivered:
        mark_delivered(n)
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        layer = get_channel_layer()
        if layer:
            async_to_sync(layer.group_send)(
                f"notifications_{user.id}",
                {"type": "notification_message", "payload": {"id": n.id, "title": title, "message": message, "emergency": emergency.id if emergency else None}},
            )
    except Exception:
        pass
    return n


def guardian_login_username(guardian):
    base = "".join(ch.lower() for ch in guardian.name if ch.isalnum()) or "guardian"
    suffix = "".join(ch for ch in guardian.phone if ch.isdigit())[-4:] or "0000"
    username = f"{base}{suffix}"
    if not User.objects.filter(username=username).exists():
        return username
    i = 2
    while User.objects.filter(username=f"{username}{i}").exists():
        i += 1
    return f"{username}{i}"


def generate_temporary_password(length=16):
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def ensure_guardian_account(guardian):
    if guardian.user_id:
        return guardian.user
    if guardian.phone:
        existing = User.objects.filter(phone=guardian.phone).first()
        if existing:
            guardian.user = existing
            guardian.save(update_fields=["user"])
            return existing
    username = guardian_login_username(guardian)
    try:
        user = User.objects.create_user(
            username=username,
            password=generate_temporary_password(),
            first_name=guardian.name,
            email=guardian.email,
            phone=guardian.phone,
            address=guardian.address,
            role="GUARDIAN",
            is_verified=guardian.is_verified,
            society=guardian.resident.society,
            block=guardian.resident.block,
            flat=guardian.resident.flat,
        )
        guardian.user = user
        guardian.save(update_fields=["user"])
        return user
    except Exception:
        try:
            user = User.objects.create_user(
                username=username,
                password=generate_temporary_password(),
                first_name=guardian.name,
                email=guardian.email,
                address=guardian.address,
                role="GUARDIAN",
                is_verified=guardian.is_verified,
                society=guardian.resident.society,
                block=guardian.resident.block,
                flat=guardian.resident.flat,
            )
            guardian.user = user
            guardian.save(update_fields=["user"])
            return user
        except Exception:
            return None


# ---------------------------- OTP Views ----------------------------
class SendOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        phone = str(request.data.get("phone", "")).strip()
        purpose = str(request.data.get("purpose", "REGISTER")).upper()
        if not phone:
            return Response({"error": "Phone number is required."}, status=400)
        
        # Generate 6-digit OTP code
        otp_code = "".join([secrets.choice("0123456789") for _ in range(6)])
        expires_at = timezone.now() + timedelta(minutes=5)
        
        PhoneOTP.objects.create(
            phone=phone,
            otp_code=otp_code,
            purpose=purpose,
            expires_at=expires_at
        )

        try:
            send_sms_notification(type("TempUser", (), {"phone": phone})(), f"Your Citizen Safety OTP is {otp_code}")
        except Exception:
            pass

        return Response({
            "message": f"OTP sent successfully to {phone}.",
            "otp_code": otp_code,
            "expires_in_seconds": 300
        }, status=200)


class VerifyOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        phone = str(request.data.get("phone", "")).strip()
        otp_code = str(request.data.get("otp_code", "")).strip()
        purpose = str(request.data.get("purpose", "REGISTER")).upper()

        if not phone or not otp_code:
            return Response({"error": "Phone number and OTP code are required."}, status=400)

        otp_record = PhoneOTP.objects.filter(
            phone=phone,
            otp_code=otp_code,
            purpose=purpose,
            is_verified=False
        ).order_by("-created_at").first()

        if not otp_record or not otp_record.is_valid():
            return Response({"error": "Invalid or expired OTP code."}, status=400)

        otp_record.is_verified = True
        otp_record.save(update_fields=["is_verified"])

        return Response({"message": "Phone number verified successfully.", "verified": True}, status=200)


class OTPLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        phone = str(request.data.get("phone", "")).strip()
        otp_code = str(request.data.get("otp_code", "")).strip()

        if not phone or not otp_code:
            return Response({"error": "Phone number and OTP code are required."}, status=400)

        otp_record = PhoneOTP.objects.filter(
            phone=phone,
            otp_code=otp_code,
            purpose="LOGIN",
            is_verified=False
        ).order_by("-created_at").first()

        if not otp_record or not otp_record.is_valid():
            return Response({"error": "Invalid or expired OTP code."}, status=400)

        user = User.objects.filter(phone=phone, is_active=True).first()
        if not user:
            return Response({"error": "No registered active account found with this phone number."}, status=404)

        otp_record.is_verified = True
        otp_record.save(update_fields=["is_verified"])

        from rest_framework_simplejwt.tokens import RefreshToken
        refresh = RefreshToken.for_user(user)

        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": UserSerializer(user, context={"request": request}).data
        }, status=200)


class OTPPasswordResetView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        phone = str(request.data.get("phone", "")).strip()
        otp_code = str(request.data.get("otp_code", "")).strip()
        new_password = str(request.data.get("new_password", "")).strip()

        if not phone or not otp_code or not new_password:
            return Response({"error": "Phone number, OTP code, and new password are required."}, status=400)

        otp_record = PhoneOTP.objects.filter(
            phone=phone,
            otp_code=otp_code,
            purpose="RESET",
            is_verified=False
        ).order_by("-created_at").first()

        if not otp_record or not otp_record.is_valid():
            return Response({"error": "Invalid or expired OTP code."}, status=400)

        user = User.objects.filter(phone=phone, is_active=True).first()
        if not user:
            return Response({"error": "No user account found with this phone number."}, status=404)

        try:
            validate_password(new_password, user)
        except Exception as exc:
            return Response({"error": " ".join(getattr(exc, "messages", [str(exc)]))}, status=400)

        user.set_password(new_password)
        user.save(update_fields=["password"])

        otp_record.is_verified = True
        otp_record.save(update_fields=["is_verified"])

        return Response({"message": "Password reset successfully via OTP."}, status=200)


# ---------------------------- auth/profile ----------------------------
class RegisterUserView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        role = str(request.data.get("role", "RESIDENT")).upper()
        if role not in {"RESIDENT", "VOLUNTEER", "SECURITY", "ADMIN"}:
            return Response({"error": "Unsupported registration role."}, status=400)
        
        data = request.data.copy()

        # Phone OTP Verification check
        phone = str(data.get("phone", "")).strip()
        otp_code = str(data.get("otp_code", "")).strip()

        if phone:
            verified_otp = PhoneOTP.objects.filter(phone=phone, purpose="REGISTER", is_verified=True).exists()
            if not verified_otp and otp_code:
                otp_rec = PhoneOTP.objects.filter(phone=phone, otp_code=otp_code, purpose="REGISTER", is_verified=False).order_by("-created_at").first()
                if otp_rec and otp_rec.is_valid():
                    otp_rec.is_verified = True
                    otp_rec.save(update_fields=["is_verified"])
                    verified_otp = True
            
            if not verified_otp and not data.get("create_new_society") and not request.data.get("skip_otp"):
                return Response({"error": "Please verify your phone number using OTP before registering."}, status=400)

        # Handle option for Admin to create a new society directly during registration
        if data.get("create_new_society") or (role == "ADMIN" and not data.get("society") and data.get("new_society_name")):
            new_soc_name = data.get("new_society_name") or data.get("society_name")
            if not new_soc_name:
                return Response({"error": "Please enter a name for the new society."}, status=400)
            society_obj = Society.objects.create(
                name=new_soc_name,
                address=data.get("society_address", ""),
                city=data.get("society_city", ""),
                state=data.get("society_state", ""),
                pincode=data.get("society_pincode", "")
            )
            data["society"] = society_obj.id

            # If initial Block and Flat details are provided, create them automatically
            block_name = data.get("block_name") or data.get("initial_block_name")
            flat_number = data.get("flat_number") or data.get("initial_flat_number")
            floor_num = data.get("floor") or data.get("initial_floor") or 1

            if block_name:
                block_obj, _ = Block.objects.get_or_create(society=society_obj, name=block_name)
                data["block"] = block_obj.id
                if flat_number:
                    flat_obj, _ = Flat.objects.get_or_create(block=block_obj, flat_number=flat_number, defaults={"floor": floor_num})
                    data["flat"] = flat_obj.id

        if not data.get("society"):
            return Response({"error": "Select or create a society before creating an account."}, status=400)
        if role == "RESIDENT" and (not data.get("block") or not data.get("flat")):
            return Response({"error": "Residents must select their block/tower and flat."}, status=400)
        if User.objects.filter(username=data.get("username", "")).exists():
            return Response({"error": "Username already exists."}, status=400)
        
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        
        if role in {"SECURITY", "VOLUNTEER"}:
            responder = User.objects.get(id=serializer.data["id"])
            ResponderMembershipRequest.objects.create(responder=responder, society_id=responder.society_id, role=role, direction="REQUEST", status="PENDING", requested_by=responder)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)



class ProfileView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request):
        return Response(UserSerializer(request.user, context={"request": request}).data)

    def patch(self, request):
        allowed = {"first_name", "last_name", "email", "phone", "address", "profile_photo"}
        payload = {key: value for key, value in request.data.items() if key in allowed}
        serializer = UserSerializer(request.user, data=payload, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        current = request.data.get("current_password", "")
        new = request.data.get("new_password", "")
        if not request.user.check_password(current):
            return Response({"error": "Current password is incorrect."}, status=400)
        try:
            validate_password(new, request.user)
        except Exception as exc:
            return Response({"error": " ".join(str(x) for x in getattr(exc, "messages", [str(exc)]))}, status=400)
        request.user.set_password(new)
        request.user.save(update_fields=["password"])
        return Response({"message": "Password changed successfully."})


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email", "").strip()
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user:
            uid = str(user.pk)
            token = default_token_generator.make_token(user)
            frontend = request.data.get("frontend_url", "http://localhost:5173/reset-password")
            link = f"{frontend}?uid={uid}&token={token}"
            send_mail("Citizen Safety password reset", f"Reset your password: {link}", "noreply@citizensafety.local", [user.email], fail_silently=True)
        return Response({"message": "If the email exists, a password reset message has been sent."})


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        try:
            user = User.objects.get(pk=urlsafe_base64_decode(request.data.get("uid", "")).decode())
        except Exception:
            try:
                user = User.objects.get(pk=request.data.get("uid"))
            except Exception:
                return Response({"error": "Invalid reset request."}, status=400)
        token = request.data.get("token", "")
        new = request.data.get("new_password", "")
        if not default_token_generator.check_token(user, token):
            return Response({"error": "Reset token is invalid or expired."}, status=400)
        try:
            validate_password(new, user)
        except Exception as exc:
            return Response({"error": " ".join(getattr(exc, "messages", [str(exc)]))}, status=400)
        user.set_password(new)
        user.save(update_fields=["password"])
        return Response({"message": "Password reset successfully."})


class VolunteerStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        if request.user.role not in ["VOLUNTEER", "SECURITY", "GUARDIAN"]:
            return Response({"error": "Only Security, Volunteer, and Guardian responders can change availability."}, status=403)
        value = str(request.data.get("volunteer_status", "")).upper()
        if value not in {"AVAILABLE", "BUSY", "OFFLINE"}:
            return Response({"error": "Invalid availability."}, status=400)
        
        if value == "AVAILABLE":
            has_active = Emergency.objects.filter(
                Q(assigned_security=request.user) | Q(assigned_volunteer=request.user) | Q(additional_responders=request.user),
                status__in=["PENDING", "ASSIGNED", "IN_PROGRESS"]
            ).exists()
            if has_active:
                return Response({"error": "A responder with an active emergency assignment cannot set status to AVAILABLE."}, status=400)
                
        request.user.volunteer_status = value
        request.user.save(update_fields=["volunteer_status"])
        return Response({"volunteer_status": value, "availability_status": value})


class AdminProvisionView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request):
        if not is_platform_admin(request.user):
            return Response({"error": "Only Platform Administrator can create Society Administrators."}, status=403)
        username = str(request.data.get("username", "")).strip()
        first_name = str(request.data.get("first_name", "")).strip()
        last_name = str(request.data.get("last_name", "")).strip()
        email = str(request.data.get("email", "")).strip()
        phone = str(request.data.get("phone", "")).strip()
        society_id = request.data.get("society")
        password = str(request.data.get("temporary_password") or request.data.get("password") or "").strip()

        if not username or not phone or not society_id:
            return Response({"error": "Username, phone, and society are required."}, status=400)
        
        try:
            society = Society.objects.get(pk=society_id)
        except Society.DoesNotExist:
            return Response({"error": "Selected society does not exist."}, status=400)

        if User.objects.filter(username=username).exists():
            return Response({"error": "Username is already taken."}, status=400)
        if User.objects.filter(phone=phone).exists():
            return Response({"error": "Phone number is already registered."}, status=400)

        if not password:
            chars = string.ascii_letters + string.digits + "@#$%"
            password = "".join(secrets.choice(chars) for _ in range(12))

        with transaction.atomic():
            admin_user = User.objects.create_user(
                username=username,
                password=password,
                role="ADMIN",
                first_name=first_name,
                last_name=last_name,
                email=email,
                phone=phone,
                society=society,
                is_verified=True,
                is_staff=False,
                is_superuser=False,
            )
        return Response({
            "message": "Society Admin created successfully.",
            "admin": UserSerializer(admin_user, context={"request": request}).data,
            "username": admin_user.username,
            "temporary_password": password,
        }, status=201)



# ---------------------------- admin/user management ----------------------------
class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by("role", "username")
    serializer_class = UserSerializer
    permission_classes = [IsAdmin]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        user = self.request.user
        if is_platform_admin(user):
            return User.objects.all().order_by("role", "username")
        return User.objects.filter(society_id=user.society_id).order_by("role", "username")

    def perform_create(self, serializer):
        role = serializer.validated_data.get("role", "RESIDENT")
        if role == "ADMIN":
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("ADMIN accounts must be created only through the controlled Create Society + Admin provisioning flow.")
        if not is_platform_admin(self.request.user):
            if not self.request.user.society_id:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("This admin is not assigned to a society.")
            created = serializer.save(society=self.request.user.society)
            if role in {"SECURITY", "VOLUNTEER"}:
                ResponderMembershipRequest.objects.create(responder=created, society=created.society, role=role, direction="INVITE", status="PENDING", requested_by=self.request.user)
        else:
            created = serializer.save()
            if role in {"SECURITY", "VOLUNTEER"} and created.society_id:
                ResponderMembershipRequest.objects.create(responder=created, society=created.society, role=role, direction="INVITE", status="PENDING", requested_by=self.request.user)

    @action(detail=True, methods=["patch"])
    def verify(self, request, pk=None):
        user = self.get_object()
        user.is_verified = bool(request.data.get("is_verified", True))
        user.save(update_fields=["is_verified"])
        return Response(UserSerializer(user, context={"request": request}).data)

    @action(detail=True, methods=["patch"])
    def disable(self, request, pk=None):
        user = self.get_object()
        if user.id == request.user.id or user.is_superuser:
            return Response({"error": "You cannot disable this account."}, status=400)
        user.is_active = False
        user.save(update_fields=["is_active"])
        return Response(UserSerializer(user, context={"request": request}).data)

    @action(detail=True, methods=["patch"])
    def activate(self, request, pk=None):
        user = self.get_object()
        user.is_active = True
        user.save(update_fields=["is_active"])
        return Response(UserSerializer(user, context={"request": request}).data)


# ---------------------------- society ----------------------------
class SocietyViewSet(viewsets.ModelViewSet):
    queryset = Society.objects.all().order_by("name")
    serializer_class = SocietySerializer

    def get_permissions(self):
        if self.action in ["list", "retrieve"]:
            return [IsAuthenticated()]
        return [IsAdmin()]

    def get_queryset(self):
        user = self.request.user
        if self.action in ["list", "retrieve"] or is_platform_admin(user) or user.role in ["SECURITY", "VOLUNTEER", "RESIDENT"]:
            return Society.objects.all().order_by("name")
        return Society.objects.filter(pk=user.society_id).order_by("name")

    def perform_create(self, serializer):
        if not is_platform_admin(self.request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only platform administrators can create societies.")
        serializer.save()

    @action(detail=False, methods=["post"], url_path="provision", permission_classes=[IsAdmin])
    def provision(self, request):
        if not is_platform_admin(request.user):
            return Response({"error": "Only a platform administrator can provision a new society and its administrator."}, status=403)
        society_data = {k: request.data.get(k, "") for k in ("name", "address", "city", "state", "pincode")}
        admin_data = {k: request.data.get(f"admin_{k}", "") for k in ("username", "first_name", "last_name", "email", "phone")}
        password = request.data.get("admin_password") or generate_temporary_password()
        if not society_data["name"] or not admin_data["username"] or not admin_data["phone"]:
            return Response({"error": "Society name, admin username and admin phone are required."}, status=400)
        if User.objects.filter(username=admin_data["username"]).exists():
            return Response({"error": "Admin username already exists."}, status=400)
        if User.objects.filter(phone=admin_data["phone"]).exists():
            return Response({"error": "Admin phone already exists."}, status=400)
        with transaction.atomic():
            society = Society.objects.create(**society_data)
            admin_user = User.objects.create_user(
                username=admin_data["username"], password=password, role="ADMIN",
                first_name=admin_data["first_name"], last_name=admin_data["last_name"],
                email=admin_data["email"], phone=admin_data["phone"], society=society,
                is_verified=True, is_staff=False, is_superuser=False,
            )
        return Response({"society": SocietySerializer(society).data, "admin": UserSerializer(admin_user, context={"request": request}).data, "temporary_password": password}, status=201)

    def destroy(self, request, *args, **kwargs):
        if not is_platform_admin(request.user):
            return Response({"error": "Society deletion is restricted to the platform administrator."}, status=403)
        return super().destroy(request, *args, **kwargs)


class BlockViewSet(viewsets.ModelViewSet):
    queryset = Block.objects.all().order_by("society_id", "name")
    serializer_class = BlockSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        user = self.request.user
        qs = Block.objects.all().order_by("society_id", "name")
        return qs if is_platform_admin(user) else qs.filter(society_id=user.society_id)

    def perform_create(self, serializer):
        society = serializer.validated_data.get("society")
        if not society or not ensure_admin_scope(self.request.user, society.id):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You cannot manage blocks outside your society.")
        serializer.save()

    def perform_update(self, serializer):
        society = serializer.validated_data.get("society", serializer.instance.society)
        if not ensure_admin_scope(self.request.user, society.id):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You cannot move a block outside your society.")
        serializer.save()


class FlatViewSet(viewsets.ModelViewSet):
    queryset = Flat.objects.all().order_by("block_id", "flat_number")
    serializer_class = FlatSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        user = self.request.user
        qs = Flat.objects.all().order_by("block_id", "flat_number")
        return qs if is_platform_admin(user) else qs.filter(block__society_id=user.society_id)

    def perform_create(self, serializer):
        block = serializer.validated_data.get("block")
        if not block or not ensure_admin_scope(self.request.user, block.society_id):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You cannot create a flat outside your society.")
        serializer.save()

    def perform_update(self, serializer):
        block = serializer.validated_data.get("block", serializer.instance.block)
        if not ensure_admin_scope(self.request.user, block.society_id):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You cannot move a flat outside your society.")
        serializer.save()


# ---------------------------- guardians ----------------------------
class GuardianViewSet(viewsets.ModelViewSet):
    serializer_class = GuardianSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == "ADMIN":
            qs = Guardian.objects.select_related("resident", "user", "requested_by")
            if is_platform_admin(user):
                return qs.all().order_by("resident_id", "guardian_type", "id")
            return qs.filter(resident__society_id=user.society_id).order_by("resident_id", "guardian_type", "id")
        if user.role in {"RESIDENT", "GUARDIAN"}:
            return Guardian.objects.select_related("user", "resident", "requested_by").filter(Q(resident=user) | Q(user=user)).distinct().order_by("guardian_type", "id")
        return Guardian.objects.none()

    def perform_create(self, serializer):
        if self.request.user.role != "RESIDENT":
            raise PermissionDenied("Only residents can create guardian contacts.")
        kind = serializer.validated_data.get("guardian_type", "EMERGENCY")
        if kind in {"PRIMARY", "SECONDARY"} and Guardian.objects.filter(resident=self.request.user, guardian_type=kind, is_active=True, relationship_status__in={"PENDING", "ACCEPTED"}).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"guardian_type": f"You already have an active or pending {kind.lower()} guardian."})
        phone = serializer.validated_data.get("phone")
        email = serializer.validated_data.get("email")
        linked_user = User.objects.filter(phone=phone).first() if phone else None
        if not linked_user and email:
            linked_user = User.objects.filter(email__iexact=email).first()
        if linked_user and linked_user.society_id not in {None, self.request.user.society_id}:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"phone": "The selected person belongs to another society."})
        if kind == "EMERGENCY" and linked_user and Guardian.objects.filter(resident=self.request.user, guardian_type="EMERGENCY", user=linked_user, is_active=True, relationship_status__in={"PENDING", "ACCEPTED"}).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"phone": "This emergency contact is already active or pending for your account."})
        guardian = serializer.save(resident=self.request.user, user=linked_user, requested_by=self.request.user, relationship_status="PENDING")
        if not guardian.user_id:
            ensure_guardian_account(guardian)
        
        if linked_user and linked_user.id != self.request.user.id:
            kind_title = "Primary Guardian" if kind == "PRIMARY" else ("Secondary Guardian" if kind == "SECONDARY" else "Emergency Contact")
            notify(
                linked_user,
                emergency=None,
                title=f"{kind_title} Request",
                message=f"{self.request.user.get_full_name() or self.request.user.username} has requested you as a {kind_title}."
            )

    def perform_update(self, serializer):
        guardian = self.get_object()
        allowed = (self.request.user.role == "ADMIN") or (self.request.user.id in {guardian.resident_id, guardian.user_id, guardian.requested_by_id})
        if not allowed:
            raise PermissionDenied("You cannot edit this guardian relationship.")
        guardian = serializer.save()
        if guardian.user:
            try:
                guardian.user.first_name = guardian.name
                guardian.user.email = guardian.email
                guardian.user.phone = guardian.phone
                guardian.user.address = guardian.address
                guardian.user.save(update_fields=["first_name", "email", "phone", "address"])
            except Exception:
                pass

    def perform_destroy(self, instance):
        allowed = (self.request.user.role == "ADMIN") or (self.request.user.id in {instance.resident_id, instance.user_id, instance.requested_by_id})
        if not allowed:
            raise PermissionDenied("You cannot delete this guardian relationship.")
        now = timezone.now()
        if instance.relationship_status == "ACCEPTED":
            instance.relationship_status = "REVOKED"
            instance.is_active = False
            instance.revoked_at = now
            instance.save(update_fields=["relationship_status", "is_active", "revoked_at"])
        else:
            instance.relationship_status = "CANCELLED"
            instance.is_active = False
            instance.cancelled_at = now
            instance.save(update_fields=["relationship_status", "is_active", "cancelled_at"])

    @action(detail=True, methods=["patch"], permission_classes=[IsAdmin])
    def verify(self, request, pk=None):
        guardian = self.get_object()
        guardian.is_verified = bool(request.data.get("is_verified", True))
        guardian.save(update_fields=["is_verified"])
        return Response(self.get_serializer(guardian).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated])
    def send_otp(self, request, pk=None):
        guardian = self.get_object()
        if not guardian.phone:
            return Response({"error": "Guardian has no phone number attached."}, status=400)
        otp_code = "".join([secrets.choice("0123456789") for _ in range(6)])
        PhoneOTP.objects.create(
            phone=guardian.phone,
            otp_code=otp_code,
            purpose="GUARDIAN",
            expires_at=timezone.now() + timedelta(minutes=5)
        )
        try:
            send_sms_notification(type("TempUser", (), {"phone": guardian.phone})(), f"Guardian Verification OTP: {otp_code}")
        except Exception:
            pass
        return Response({"message": f"OTP sent to guardian phone {guardian.phone}", "otp_code": otp_code})

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated])
    def verify_otp(self, request, pk=None):
        guardian = self.get_object()
        otp_code = str(request.data.get("otp_code", "")).strip()
        if not guardian.phone or not otp_code:
            return Response({"error": "Guardian phone and OTP code are required."}, status=400)
        
        otp_record = PhoneOTP.objects.filter(
            phone=guardian.phone,
            otp_code=otp_code,
            purpose="GUARDIAN",
            is_verified=False
        ).order_by("-created_at").first()

        if not otp_record or not otp_record.is_valid():
            return Response({"error": "Invalid or expired OTP code for guardian."}, status=400)

        otp_record.is_verified = True
        otp_record.save(update_fields=["is_verified"])

        guardian.is_verified = True
        guardian.save(update_fields=["is_verified"])
        if guardian.user:
            guardian.user.is_verified = True
            guardian.user.save(update_fields=["is_verified"])

        return Response({"message": "Guardian phone verified via OTP successfully.", "guardian": self.get_serializer(guardian).data})


    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated])
    def accept(self, request, pk=None):
        guardian = self.get_object()
        invited_person = guardian.user_id == request.user.id
        reverse_request_target = guardian.requested_by_id == guardian.user_id and guardian.resident_id == request.user.id
        if not (invited_person or reverse_request_target):
            return Response({"error": "Only the invited person or the resident receiving a reverse guardian request can accept this relationship."}, status=403)
        if guardian.relationship_status not in {"PENDING", "DECLINED"}:
            return Response({"error": "This relationship is not awaiting acceptance."}, status=400)
        now = timezone.now()
        guardian.relationship_status = "ACCEPTED"
        guardian.is_active = True
        guardian.accepted_at = now
        guardian.save(update_fields=["relationship_status", "is_active", "accepted_at"])

        target_user = guardian.requested_by or (guardian.resident if guardian.user_id == request.user.id else guardian.user)
        if target_user and target_user.id != request.user.id:
            notify(
                target_user,
                emergency=None,
                title="Guardian Request Accepted",
                message=f"{request.user.get_full_name() or request.user.username} accepted your {guardian.get_guardian_type_display()} request."
            )
        return Response(self.get_serializer(guardian).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated])
    def decline(self, request, pk=None):
        guardian = self.get_object()
        invited_person = guardian.user_id == request.user.id
        reverse_request_target = guardian.requested_by_id == guardian.user_id and guardian.resident_id == request.user.id
        if not (invited_person or reverse_request_target):
            return Response({"error": "Only the invited person or the resident receiving a reverse guardian request can decline this relationship."}, status=403)
        now = timezone.now()
        guardian.relationship_status = "DECLINED"
        guardian.is_active = False
        guardian.declined_at = now
        guardian.save(update_fields=["relationship_status", "is_active", "declined_at"])

        target_user = guardian.requested_by or (guardian.resident if guardian.user_id == request.user.id else guardian.user)
        if target_user and target_user.id != request.user.id:
            notify(
                target_user,
                emergency=None,
                title="Guardian Request Declined",
                message=f"{request.user.get_full_name() or request.user.username} declined your {guardian.get_guardian_type_display()} request."
            )
        return Response(self.get_serializer(guardian).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated])
    def create_login(self, request, pk=None):
        if request.user.role != "ADMIN":
            return Response({"error": "Only an administrator can create a guardian login."}, status=403)
        guardian = self.get_object()
        if not guardian.is_verified:
            guardian.is_verified = True
            guardian.save(update_fields=["is_verified"])
        user = ensure_guardian_account(guardian)
        if not user:
            return Response({"error": "Unable to create or link user account for this guardian."}, status=400)
        temporary_password = generate_temporary_password()
        user.set_password(temporary_password)
        user.is_active = True
        user.is_verified = True
        user.save(update_fields=["password", "is_active", "is_verified"])
        return Response({
            "username": user.username,
            "temporary_password": temporary_password,
            "message": "Secure temporary credentials generated. Share them through a secure channel and require a password change after first login.",
        })

    @action(detail=False, methods=["post"], url_path="request", permission_classes=[IsAuthenticated])
    def request_relationship(self, request):
        if request.user.role not in {"RESIDENT", "GUARDIAN"}:
            return Response({"error": "Only resident users can request a guardian relationship."}, status=403)
        resident_id = request.data.get("resident")
        lookup = str(request.data.get("resident_username", "")).strip()
        phone = str(request.data.get("resident_phone", "")).strip()
        if resident_id:
            target = User.objects.filter(id=resident_id, role="RESIDENT").first()
        elif lookup:
            target = User.objects.filter(username__iexact=lookup, role="RESIDENT").first()
        else:
            target = User.objects.filter(phone=phone, role="RESIDENT").first()
        if not target:
            return Response({"error": "Target resident was not found."}, status=404)
        if target.id == request.user.id:
            return Response({"error": "You cannot create a guardian relationship with yourself."}, status=400)
        if target.society_id not in {None, request.user.society_id}:
            return Response({"error": "The resident belongs to another society."}, status=403)
        kind = str(request.data.get("guardian_type", "PRIMARY")).upper()
        if kind not in {"PRIMARY", "SECONDARY", "EMERGENCY"}:
            return Response({"error": "Invalid guardian type."}, status=400)
        if Guardian.objects.filter(resident=target, guardian_type=kind, user=request.user, is_active=True, relationship_status__in={"PENDING", "ACCEPTED"}).exists():
            return Response({"error": f"You already have an active or pending {kind.lower()} request for this resident."}, status=400)
        if kind in {"PRIMARY", "SECONDARY"} and Guardian.objects.filter(resident=target, guardian_type=kind, is_active=True, relationship_status__in={"PENDING", "ACCEPTED"}).exists():
            return Response({"error": f"That resident already has an active or pending {kind.lower()} guardian."}, status=400)
        guardian = Guardian.objects.create(
            resident=target, user=request.user,
            name=request.user.get_full_name() or request.user.username,
            relation=request.data.get("relation", "Trusted Person"),
            phone=request.user.phone, email=request.user.email, address=request.user.address,
            guardian_type=kind, is_verified=False, is_active=True,
            relationship_status="PENDING", requested_by=request.user,
        )

        kind_title = "Primary Guardian" if kind == "PRIMARY" else ("Secondary Guardian" if kind == "SECONDARY" else "Emergency Contact")
        notify(
            target,
            emergency=None,
            title=f"{kind_title} Request",
            message=f"{request.user.get_full_name() or request.user.username} wants to become your {kind_title}."
        )
        return Response(self.get_serializer(guardian).data, status=201)

    @action(detail=False, methods=["get"], permission_classes=[IsAuthenticated])
    def mine(self, request):
        qs = Guardian.objects.select_related("resident", "user", "requested_by").filter(
            Q(user=request.user) | Q(resident=request.user)
        ).distinct().order_by("resident_id", "guardian_type", "id")
        return Response(self.get_serializer(qs, many=True).data)


# ---------------------------- emergencies ----------------------------
class EmergencyViewSet(viewsets.ModelViewSet):
    queryset = Emergency.objects.all()
    serializer_class = EmergencySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == "ADMIN":
            qs = Emergency.objects.select_related("user", "assigned_security", "assigned_volunteer").prefetch_related("escalations", "audit_logs")
            if not is_platform_admin(user):
                qs = qs.filter(user__society_id=user.society_id)
        elif user.role == "RESIDENT":
            accepted_ids = EmergencyEscalation.objects.filter(responder=user, response_status="ACCEPTED").values_list("emergency_id", flat=True)
            guardian_resident_ids = Guardian.objects.filter(user=user, relationship_status="ACCEPTED", is_active=True).values_list("resident_id", flat=True)
            qs = Emergency.objects.filter(Q(user=user) | Q(user_id__in=guardian_resident_ids) | Q(id__in=accepted_ids)).distinct()
        elif user.role == "GUARDIAN":
            guardian_resident_ids = Guardian.objects.filter(user=user, relationship_status="ACCEPTED", is_active=True).values_list("resident_id", flat=True)
            accepted_ids = EmergencyEscalation.objects.filter(responder=user, response_status="ACCEPTED").values_list("emergency_id", flat=True)
            qs = Emergency.objects.filter(Q(user_id__in=guardian_resident_ids) | Q(id__in=accepted_ids)).distinct()
        elif user.role == "SECURITY":
            qs = Emergency.objects.filter(user__society=user.society)
        elif user.role == "VOLUNTEER":
            notified = Notification.objects.filter(user=user).values_list("emergency_id", flat=True)
            qs = Emergency.objects.filter(user__society_id=user.society_id).filter(
                Q(assigned_volunteer=user) | Q(id__in=notified)
            ).distinct()
        else:
            qs = Emergency.objects.none()
        params = self.request.query_params
        if params.get("status"):
            qs = qs.filter(status=params["status"].upper())
        if params.get("priority"):
            qs = qs.filter(priority=params["priority"].upper())
        if params.get("type"):
            qs = qs.filter(emergency_type=params["type"].upper())
        if params.get("q"):
            term = params["q"].strip()
            qs = qs.filter(Q(location__icontains=term) | Q(description__icontains=term) | Q(user__username__icontains=term))
        return qs.order_by("-created_at")

    def get_permissions(self):
        if self.action == "create":
            return [IsAuthenticated(), IsResident()]
        if self.action == "assign":
            return [IsAuthenticated(), IsAdminOrSecurity()]
        if self.action == "accept":
            return [IsAuthenticated(), IsVolunteer()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        emergency = serializer.save(user=self.request.user)
        audit(emergency, self.request.user, "SOS_CREATED", f"{emergency.emergency_type} at {emergency.location}")

    @action(detail=False, methods=["get"], url_path="status-counts")
    def status_counts(self, request):
        qs = self.get_queryset()
        return Response({"counts": {"ALL": qs.count(), **{s: qs.filter(status=s).count() for s, _ in Emergency.STATUS}}})

    @action(detail=True, methods=["patch"])
    def assign(self, request, pk=None):
        if request.user.role != "ADMIN":
            return Response({"error": "Only an authorized administrator can manually assign responders."}, status=403)
        emergency = self.get_object()
        security_id = request.data.get("assigned_security")
        volunteer_id = request.data.get("assigned_volunteer")
        if security_id:
            responder = get_object_or_404(User, id=security_id, role="SECURITY", volunteer_status="AVAILABLE")
            if emergency.user.society_id and responder.society_id != emergency.user.society_id:
                return Response({"error": "Responder belongs to another society."}, status=400)
            emergency.assigned_security = responder
            responder.volunteer_status = "BUSY"
            responder.save(update_fields=["volunteer_status"])
        if volunteer_id:
            responder = get_object_or_404(User, id=volunteer_id, role="VOLUNTEER", volunteer_status="AVAILABLE")
            if emergency.user.society_id and responder.society_id != emergency.user.society_id:
                return Response({"error": "Responder belongs to another society."}, status=400)
            emergency.assigned_volunteer = responder
            responder.volunteer_status = "BUSY"
            responder.save(update_fields=["volunteer_status"])
        if not security_id and not volunteer_id:
            return Response({"error": "Select an available responder."}, status=400)
        emergency.status = "ASSIGNED"
        emergency.accepted_at = timezone.now()
        emergency.save(update_fields=["assigned_security", "assigned_volunteer", "status", "accepted_at"])
        audit(emergency, request.user, "RESPONDER_ASSIGNED", f"Security={security_id}, Volunteer={volunteer_id}")
        return Response(self.get_serializer(emergency, context={"request": request}).data)

    @action(detail=True, methods=["patch"])
    def accept(self, request, pk=None):
        if request.user.role != "VOLUNTEER":
            return Response({"error": "Only Volunteer responders can use the volunteer acceptance action."}, status=403)
        volunteer = request.user
        if not volunteer.is_verified:
            return Response({"error": "Your account must be verified before accepting emergencies."}, status=403)
        if not responder_membership_approved(volunteer, volunteer.society_id):
            return Response({"error": "Volunteer membership must be approved before responding."}, status=403)
        if volunteer.volunteer_status != "AVAILABLE":
            return Response({"error": "You must be AVAILABLE to accept an emergency."}, status=400)
        
        has_active = Emergency.objects.filter(
            Q(assigned_security=volunteer) | Q(assigned_volunteer=volunteer) | Q(additional_responders=volunteer),
            status__in=["PENDING", "ASSIGNED", "IN_PROGRESS"]
        ).exclude(pk=pk).exists()
        if has_active:
            return Response({"error": "You already have an active emergency response in progress."}, status=400)

        with transaction.atomic():
            try:
                emergency = Emergency.objects.select_for_update().get(pk=pk)
            except Emergency.DoesNotExist:
                return Response({"error": "Emergency not found."}, status=404)

            if (emergency.user.society_id and
                    emergency.user.society_id != volunteer.society_id):
                return Response(
                    {"error": "This emergency belongs to another society."},
                    status=403
                )

            if not Notification.objects.filter(user=volunteer, emergency=emergency).exists():
                return Response({"error": "You were not notified about this emergency."}, status=403)
            if emergency.status in {"RESOLVED", "CANCELLED", "AUTO_CLOSED"} or emergency.assigned_volunteer_id or emergency.assigned_security_id:
                return Response({"error": "This emergency has already been accepted."}, status=409)
            
            current_stage = emergency.escalations.filter(response_status="WAITING").order_by("-created_at").first()
            if not current_stage or current_stage.contact_type not in {"VOLUNTEER", "PENDING"}:
                return Response({"error": "This emergency is not currently assigned to the volunteer/community response stage."}, status=400)
            
            if current_stage.response_deadline and current_stage.response_deadline <= timezone.now():
                return Response({"error": "Response deadline has expired for this stage."}, status=409)

            emergency.assigned_volunteer = volunteer
            emergency.accepted_at = timezone.now()
            emergency.status = "ASSIGNED"
            emergency.save(update_fields=["assigned_volunteer", "accepted_at", "status"])
            volunteer.volunteer_status = "BUSY"
            volunteer.save(update_fields=["volunteer_status"])
            
            current_stage.responder = volunteer
            current_stage.response_status = "ACCEPTED"
            current_stage.responded_at = timezone.now()
            current_stage.save(update_fields=["responder", "response_status", "responded_at"])
            audit(emergency, volunteer, "VOLUNTEER_ACCEPTED", "Volunteer accepted the incident.")
            notify(emergency.user, emergency, "Volunteer Accepted", f"{volunteer.username} accepted Emergency #{emergency.id}.")
            return Response(self.get_serializer(emergency, context={"request": request}).data)

    @action(detail=True, methods=["patch"], url_path="security-accept")
    def security_accept(self, request, pk=None):
        if request.user.role != "SECURITY" or not responder_membership_approved(request.user, request.user.society_id):
            return Response({"error": "Security membership must be approved before responding."}, status=403)
        if request.user.volunteer_status != "AVAILABLE":
            return Response({"error": "Set availability to AVAILABLE first."}, status=400)
        
        has_active = Emergency.objects.filter(
            Q(assigned_security=request.user) | Q(assigned_volunteer=request.user) | Q(additional_responders=request.user),
            status__in=["PENDING", "ASSIGNED", "IN_PROGRESS"]
        ).exclude(pk=pk).exists()
        if has_active:
            return Response({"error": "You already have an active emergency response in progress."}, status=400)

        with transaction.atomic():
            try:
                emergency = Emergency.objects.select_for_update().get(pk=pk)
            except Emergency.DoesNotExist:
                return Response({"error": "Emergency not found."}, status=404)

            if emergency.user.society_id and emergency.user.society_id != request.user.society_id:
                return Response({"error": "This emergency belongs to another society."}, status=403)
            if emergency.status in {"RESOLVED", "CANCELLED", "AUTO_CLOSED"} or emergency.assigned_security_id or emergency.assigned_volunteer_id:
                return Response({"error": "This emergency has already been accepted."}, status=409)
            
            current_stage = emergency.escalations.filter(response_status="WAITING").order_by("-created_at").first()
            if not current_stage or current_stage.contact_type not in {"SECURITY", "PENDING"}:
                return Response({"error": "This emergency is not currently assigned to the security/community response stage."}, status=400)
            
            if current_stage.response_deadline and current_stage.response_deadline <= timezone.now():
                return Response({"error": "Response deadline has expired for this stage."}, status=409)

            emergency.assigned_security = request.user
            emergency.accepted_at = timezone.now()
            emergency.status = "ASSIGNED"
            emergency.save(update_fields=["assigned_security", "accepted_at", "status"])
            request.user.volunteer_status = "BUSY"
            request.user.save(update_fields=["volunteer_status"])
            
            current_stage.responder = request.user
            current_stage.response_status = "ACCEPTED"
            current_stage.responded_at = timezone.now()
            current_stage.save(update_fields=["responder", "response_status", "responded_at"])
            audit(emergency, request.user, "SECURITY_ACCEPTED", "Security accepted the incident.")
            notify(emergency.user, emergency, "Security Accepted Emergency", f"{request.user.username} accepted Emergency #{emergency.id}.")
            return Response(self.get_serializer(emergency, context={"request": request}).data)

    @action(detail=False, methods=["get"], url_path="pending-queue")
    def pending_queue(self, request):
        if not request.user.is_authenticated or not request.user.society_id:
            return Response([])
        qs = (
            Emergency.objects.select_related("user", "user__society", "user__block", "user__flat")
            .filter(
                status="PENDING",
                user__society_id=request.user.society_id,
                escalations__contact_type="PENDING",
                escalations__response_status="WAITING",
            )
            .distinct()
            .order_by("-created_at")
        )
        data = []
        for emergency in qs:
            data.append({
                "id": emergency.id,
                "emergency_type": emergency.get_emergency_type_display(),
                "priority": emergency.priority,
                "location": emergency.location,
                "latitude": emergency.latitude,
                "longitude": emergency.longitude,
                "created_at": emergency.created_at,
                "block": emergency.user.block.name if emergency.user.block else None,
                "flat": emergency.user.flat.flat_number if emergency.user.flat else None,
                "requester": emergency.user.get_full_name() or emergency.user.username,
            })
        return Response(data)

    @action(detail=True, methods=["patch"], url_path="pending-accept")
    def pending_accept(self, request, pk=None):
        """Allow only verified Security/Volunteer responders to accept an open community emergency."""
        if request.user.role not in {"SECURITY", "VOLUNTEER"} or not responder_membership_approved(request.user, request.user.society_id):
            return Response({"error": "Responder membership must be approved before accepting community emergencies."}, status=403)
        if not request.user.is_verified:
            return Response({"error": "Your account must be verified before accepting community emergencies."}, status=403)
        if request.user.volunteer_status != "AVAILABLE":
            return Response({"error": "Set availability to AVAILABLE first."}, status=400)

        has_active = Emergency.objects.filter(
            Q(assigned_security=request.user) | Q(assigned_volunteer=request.user) | Q(additional_responders=request.user),
            status__in=["PENDING", "ASSIGNED", "IN_PROGRESS"]
        ).exclude(pk=pk).exists()
        if has_active:
            return Response({"error": "You already have an active emergency response in progress."}, status=400)

        with transaction.atomic():
            try:
                emergency = Emergency.objects.select_for_update().get(pk=pk)
            except Emergency.DoesNotExist:
                return Response({"error": "Emergency not found."}, status=404)

            if request.user.id == emergency.user_id:
                return Response({"error": "The resident who raised the SOS cannot accept their own pending emergency."}, status=400)
            if emergency.user.society_id and request.user.society_id != emergency.user.society_id:
                return Response({"error": "This emergency belongs to another society."}, status=403)
            if emergency.status != "PENDING":
                return Response({"error": "This emergency is no longer pending."}, status=409)
            if emergency.escalations.filter(response_status="ACCEPTED").exists():
                return Response({"error": "This emergency already has an accepted responder."}, status=409)

            esc = emergency.escalations.filter(contact_type="PENDING", response_status="WAITING").order_by("-created_at").first()
            if not esc:
                return Response({"error": "This emergency is not currently in the pending community queue."}, status=400)

            if esc.created_at + timedelta(hours=6) <= timezone.now():
                return Response({"error": "This pending emergency has expired after 6 hours."}, status=409)

            now = timezone.now()
            esc.responder = request.user
            esc.response_status = "ACCEPTED"
            esc.responded_at = now
            esc.save(update_fields=["responder", "response_status", "responded_at"])
            
            emergency.accepted_at = now
            emergency.status = "ASSIGNED"
            update_fields = ["accepted_at", "status"]
            if request.user.role == "SECURITY":
                emergency.assigned_security = request.user
                update_fields.append("assigned_security")
            elif request.user.role == "VOLUNTEER":
                emergency.assigned_volunteer = request.user
                update_fields.append("assigned_volunteer")
            emergency.save(update_fields=update_fields)

            request.user.volunteer_status = "BUSY"
            request.user.save(update_fields=["volunteer_status"])

            audit(emergency, request.user, "PENDING_ACCEPTED", f"Open pending emergency accepted by {request.user.username} ({request.user.role}).")
            notify(emergency.user, emergency, "Community Responder Accepted", f"{request.user.get_full_name() or request.user.username} accepted Emergency #{emergency.id}.")
            return Response(self.get_serializer(emergency, context={"request": request}).data)

    @action(detail=True, methods=["patch"], url_path="mark-reached")
    def mark_reached(self, request, pk=None):
        emergency = self.get_object()
        accepted_escalation = emergency.escalations.filter(responder=request.user, response_status="ACCEPTED").order_by("-responded_at", "-created_at").first()
        if request.user.id not in {emergency.assigned_security_id, emergency.assigned_volunteer_id} and not accepted_escalation:
            return Response({"error": "Only the assigned responder can mark this emergency as reached."}, status=403)
        if emergency.status != "ASSIGNED":
            return Response({"error": "The emergency must be assigned before marking it as reached."}, status=400)
        if emergency.reached_at:
            return Response(self.get_serializer(emergency, context={"request": request}).data)
        emergency.reached_at = timezone.now()
        emergency.save(update_fields=["reached_at"])
        audit(emergency, request.user, "RESPONDER_REACHED", "Responder reached the emergency location.")
        notify(emergency.user, emergency, "Responder Reached", f"Your responder has reached the location for Emergency #{emergency.id}.")
        return Response(self.get_serializer(emergency, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="request-handover")
    def request_handover(self, request, pk=None):
        emergency = self.get_object()
        if request.user.id not in {emergency.assigned_security_id, emergency.assigned_volunteer_id}:
            return Response({"error": "Only the current responder can request a handover."}, status=403)
        if emergency.status not in {"ASSIGNED", "IN_PROGRESS"}:
            return Response({"error": "Handover is only available for an active response."}, status=400)
        if emergency.escalations.filter(contact_type="HANDOVER", response_status="WAITING").exists():
            return Response({"error": "A handover request is already active."}, status=400)
        approved_ids = set(ResponderMembershipRequest.objects.filter(society_id=emergency.user.society_id, status="ACCEPTED").values_list("responder_id", flat=True))
        users = User.objects.filter(
            id__in=approved_ids,
            role__in=["SECURITY", "VOLUNTEER"],
            is_active=True,
            is_verified=True,
            volunteer_status="AVAILABLE",
            society_id=emergency.user.society_id
        ).exclude(id=request.user.id).distinct()
        if not users.exists():
            return Response({"error": "No eligible responder is currently available for handover."}, status=400)
        esc = EmergencyEscalation.objects.create(emergency=emergency, contact_type="HANDOVER", response_status="WAITING", response_deadline=timezone.now()+timedelta(seconds=120))
        for user in users:
            notify(user, emergency, "Handover Requested", f"Emergency #{emergency.id} needs a responder handover. Current responder: {request.user.get_full_name() or request.user.username}.")
        audit(emergency, request.user, "HANDOVER_REQUESTED", "Current responder requested a handover.")
        return Response({"message": "Handover request sent to eligible responders."}, status=201)

    @action(detail=True, methods=["post"], url_path="accept-handover")
    def accept_handover(self, request, pk=None):
        with transaction.atomic():
            try:
                emergency = Emergency.objects.select_for_update().get(pk=pk)
            except Emergency.DoesNotExist:
                return Response({"error": "Emergency not found."}, status=404)
            if request.user.role not in {"SECURITY", "VOLUNTEER"} or not responder_membership_approved(request.user, request.user.society_id) or request.user.volunteer_status != "AVAILABLE":
                return Response({"error": "Only an approved, available responder can accept a handover."}, status=403)
            esc = emergency.escalations.select_for_update().filter(contact_type="HANDOVER", response_status="WAITING").order_by("-created_at").first()
            if not esc:
                return Response({"error": "No active handover request exists."}, status=400)
            if emergency.status not in {"ASSIGNED", "IN_PROGRESS"}:
                return Response({"error": "This emergency is no longer active."}, status=400)
            old_security = emergency.assigned_security
            old_volunteer = emergency.assigned_volunteer
            old = old_security or old_volunteer

            esc.responder = request.user
            esc.response_status = "ACCEPTED"
            esc.responded_at = timezone.now()
            esc.save(update_fields=["responder", "response_status", "responded_at"])

            if old:
                old.volunteer_status = "AVAILABLE"
                old.save(update_fields=["volunteer_status"])

            if request.user.role == "SECURITY":
                emergency.assigned_security = request.user
                if old_volunteer and old_volunteer == old:
                    emergency.assigned_volunteer = None
            elif request.user.role == "VOLUNTEER":
                emergency.assigned_volunteer = request.user
                if old_security and old_security == old:
                    emergency.assigned_security = None

            emergency.save(update_fields=["assigned_security", "assigned_volunteer"])
            request.user.volunteer_status = "BUSY"
            request.user.save(update_fields=["volunteer_status"])
            audit(emergency, request.user, "HANDOVER_ACCEPTED", "Responder accepted the handover.")
            notify(emergency.user, emergency, "Responder Handover Complete", f"{request.user.get_full_name() or request.user.username} is now the current responder.")
            return Response(self.get_serializer(emergency, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="request-additional-help")
    def request_additional_help(self, request, pk=None):
        emergency = self.get_object()
        if request.user.id not in {emergency.assigned_security_id, emergency.assigned_volunteer_id}:
            return Response({"error": "Only the current responder can request additional help."}, status=403)
        if emergency.status not in {"ASSIGNED", "IN_PROGRESS"}:
            return Response({"error": "Additional help is only available during an active response."}, status=400)
        approved_ids = set(ResponderMembershipRequest.objects.filter(society_id=emergency.user.society_id, status="ACCEPTED").values_list("responder_id", flat=True))
        users = User.objects.filter(
            id__in=approved_ids,
            role__in=["SECURITY", "VOLUNTEER"],
            is_active=True,
            is_verified=True,
            volunteer_status="AVAILABLE",
            society_id=emergency.user.society_id
        ).exclude(id=request.user.id).exclude(id__in=emergency.additional_responders.values_list("id", flat=True)).distinct()
        if not users.exists():
            return Response({"error": "No additional responder is currently available."}, status=400)
        esc = EmergencyEscalation.objects.create(emergency=emergency, contact_type="ADDITIONAL_HELP", response_status="WAITING", response_deadline=timezone.now()+timedelta(seconds=120))
        for user in users:
            notify(user, emergency, "Additional Help Requested", f"Emergency #{emergency.id} needs additional assistance. Current responder: {request.user.get_full_name() or request.user.username}.")
        audit(emergency, request.user, "ADDITIONAL_HELP_REQUESTED", "Current responder requested additional help.")
        return Response({"message": "Additional help request sent."}, status=201)

    @action(detail=True, methods=["post"], url_path="accept-additional-help")
    def accept_additional_help(self, request, pk=None):
        with transaction.atomic():
            try:
                emergency = Emergency.objects.select_for_update().get(pk=pk)
            except Emergency.DoesNotExist:
                return Response({"error": "Emergency not found."}, status=404)
            if request.user.role not in {"SECURITY", "VOLUNTEER"} or not responder_membership_approved(request.user, request.user.society_id) or request.user.volunteer_status != "AVAILABLE":
                return Response({"error": "Only an approved, available responder can accept additional help."}, status=403)
            if emergency.additional_responders.filter(id=request.user.id).exists():
                return Response({"error": "You are already an additional responder for this emergency."}, status=400)
            esc = emergency.escalations.select_for_update().filter(contact_type="ADDITIONAL_HELP", response_status="WAITING").order_by("-created_at").first()
            if not esc or emergency.status not in {"ASSIGNED", "IN_PROGRESS"}:
                return Response({"error": "No active additional-help request exists."}, status=400)
            esc.responder = request.user; esc.response_status = "ACCEPTED"; esc.responded_at = timezone.now(); esc.save(update_fields=["responder","response_status","responded_at"])
            emergency.additional_responders.add(request.user)
            request.user.volunteer_status = "BUSY"; request.user.save(update_fields=["volunteer_status"])
            audit(emergency, request.user, "ADDITIONAL_HELP_ACCEPTED", "Responder joined as an additional responder.")
            notify(emergency.user, emergency, "Additional Responder Joined", f"{request.user.get_full_name() or request.user.username} joined to provide additional assistance.")
            return Response(self.get_serializer(emergency, context={"request": request}).data)

    @action(detail=True, methods=["patch"], url_path="start-assistance")
    def start_assistance(self, request, pk=None):
        emergency = self.get_object()
        accepted_escalation = emergency.escalations.filter(
            responder=request.user, response_status="ACCEPTED"
        ).order_by("-responded_at", "-created_at").first()
        is_assigned = request.user.id in {emergency.assigned_security_id, emergency.assigned_volunteer_id} or bool(accepted_escalation)
        if not is_assigned:
            return Response({"error": "This emergency is not assigned to you."}, status=403)
        if emergency.status != "ASSIGNED":
            return Response({"error": "Assistance can only start from ASSIGNED status."}, status=400)
        if not emergency.reached_at:
            return Response({"error": "Mark the location as reached before starting assistance."}, status=400)
        emergency.status = "IN_PROGRESS"; emergency.assistance_started_at = timezone.now(); emergency.save(update_fields=["status", "assistance_started_at"])
        audit(emergency, request.user, "ASSISTANCE_STARTED", "Responder started assistance.")
        notify(emergency.user, emergency, "Assistance Started", f"Assistance has started for Emergency #{emergency.id}.")
        return Response(self.get_serializer(emergency, context={"request": request}).data)

    @action(detail=True, methods=["patch"])
    def cancel(self, request, pk=None):
        with transaction.atomic():
            try:
                emergency = Emergency.objects.select_for_update().get(pk=pk)
            except Emergency.DoesNotExist:
                return Response({"error": "Emergency not found."}, status=404)
            if request.user.id not in {emergency.assigned_security_id, emergency.assigned_volunteer_id}:
                return Response({"error": "You are not the assigned responder."}, status=403)
            if emergency.status in {"IN_PROGRESS", "RESOLVED"}:
                return Response({"error": "This incident cannot be cancelled at its current stage."}, status=400)
            reason = str(request.data.get("reason", "OTHER")).upper()
            comment = str(request.data.get("comment", ""))
            now = timezone.now()
            esc = emergency.escalations.filter(response_status="ACCEPTED", responder=request.user).order_by("-created_at").first()
            if esc:
                esc.response_status = "CANCELLED"
                esc.cancelled_at = now
                esc.cancel_reason = reason
                esc.cancel_comment = comment
                esc.save(update_fields=["response_status", "cancelled_at", "cancel_reason", "cancel_comment"])
            emergency.assigned_security = None
            emergency.assigned_volunteer = None
            emergency.status = "PENDING"
            emergency.save(update_fields=["assigned_security", "assigned_volunteer", "status"])
            
            pending_esc = emergency.escalations.filter(contact_type="PENDING", response_status="WAITING").first()
            if not pending_esc:
                pending_esc = EmergencyEscalation.objects.create(emergency=emergency, contact_type="PENDING", response_status="WAITING")
            
            request.user.volunteer_status = "AVAILABLE"
            request.user.save(update_fields=["volunteer_status"])

            for helper in emergency.additional_responders.all():
                if helper.volunteer_status == "BUSY":
                    helper.volunteer_status = "AVAILABLE"
                    helper.save(update_fields=["volunteer_status"])
            emergency.additional_responders.clear()
            
            approved_ids = set(ResponderMembershipRequest.objects.filter(society_id=emergency.user.society_id, status="ACCEPTED").values_list("responder_id", flat=True))
            users = User.objects.filter(
                id__in=approved_ids,
                role__in=["SECURITY", "VOLUNTEER"],
                is_active=True,
                is_verified=True,
                volunteer_status="AVAILABLE",
                society_id=emergency.user.society_id
            ).exclude(id=request.user.id).exclude(id=emergency.user_id).distinct()
            
            for u in users:
                notify(u, emergency, "Emergency Returned to Pending Queue", f"Emergency #{emergency.id} responder cancelled. Emergency is now available in open pending queue.")

            audit(emergency, request.user, "RESPONDER_CANCELLED", f"Reason={reason}; {comment}")
            return Response(self.get_serializer(emergency, context={"request": request}).data)

    @action(detail=True, methods=["patch"], url_path="guardian-response")
    def guardian_response(self, request, pk=None):
        if request.user.role not in {"RESIDENT", "GUARDIAN"}:
            return Response({"error": "Guardian responsibility access required."}, status=403)
        emergency = self.get_object()
        # Find the active escalation for this guardian
        esc = (
            emergency.escalations
            .filter(responder=request.user, response_status__in=["WAITING", "ACCEPTED"], guardian__isnull=False)
            .select_related("guardian")
            .order_by("-created_at")
            .first()
        )
        guardian = esc.guardian if esc else Guardian.objects.filter(
            user=request.user, resident=emergency.user,
            relationship_status="ACCEPTED", is_active=True
        ).order_by("guardian_type").first()
        if not esc and guardian:
            esc = emergency.escalations.filter(
                guardian=guardian, response_status__in=["WAITING", "ACCEPTED"]
            ).order_by("-created_at").first()
        if not guardian or not esc:
            return Response({"error": "This emergency is not currently waiting for your response."}, status=400)
        decision = str(request.data.get("decision", "")).upper()
        if decision not in {"ACCEPT", "DECLINE", "CANCEL"}:
            return Response({"error": "Decision must be ACCEPT, DECLINE or CANCEL."}, status=400)
        now = timezone.now()

        if decision == "ACCEPT":
            esc.responder = request.user
            esc.response_status = "ACCEPTED"
            esc.responded_at = now
            esc.save(update_fields=["responder", "response_status", "responded_at"])
            emergency.status = "ASSIGNED"
            emergency.accepted_at = now
            emergency.save(update_fields=["status", "accepted_at"])
            audit(emergency, request.user, "GUARDIAN_ACCEPTED", f"{guardian.guardian_type} guardian accepted Emergency #{emergency.id}.")
            notify(emergency.user, emergency, "Guardian Accepted", f"{guardian.name} accepted Emergency #{emergency.id}.")
            return Response(self.get_serializer(emergency, context={"request": request}).data)

        # DECLINE or CANCEL – close current escalation then advance chain
        if decision == "DECLINE":
            if esc.response_status not in {"WAITING"}:
                return Response({"error": "This escalation is not awaiting a response."}, status=400)
            esc.responder = request.user
            esc.response_status = "DECLINED"
            esc.responded_at = now
            esc.save(update_fields=["responder", "response_status", "responded_at"])
            audit(emergency, request.user, "GUARDIAN_DECLINED",
                  f"{guardian.guardian_type} guardian declined Emergency #{emergency.id}.")
            notify(emergency.user, emergency, "Guardian Declined",
                   f"{guardian.name} declined Emergency #{emergency.id}. Escalating to next responder.")
        else:  # CANCEL
            if esc.response_status not in {"WAITING", "ACCEPTED"}:
                return Response({"error": "This guardian response cannot be cancelled."}, status=400)
            esc.responder = request.user
            esc.response_status = "CANCELLED"
            esc.responded_at = now
            esc.cancelled_at = now
            esc.cancel_reason = "GUARDIAN_CANCELLED"
            esc.cancel_comment = str(request.data.get("comment", "Guardian cancelled the response."))
            esc.save(update_fields=["responder", "response_status", "responded_at",
                                    "cancelled_at", "cancel_reason", "cancel_comment"])
            # If guardian had already accepted, release assigned state
            if emergency.status == "ASSIGNED":
                emergency.status = "PENDING"
                emergency.assigned_security = None
                emergency.assigned_volunteer = None
                emergency.save(update_fields=["status", "assigned_security", "assigned_volunteer"])
            audit(emergency, request.user, "GUARDIAN_CANCELLED",
                  f"{guardian.guardian_type} guardian cancelled their response.")
            notify(emergency.user, emergency, "Guardian Cancelled",
                   f"{guardian.name} cancelled their response to Emergency #{emergency.id}. Escalating.")

        # CRITICAL: advance the chain – do NOT leave the emergency stranded
        from api.services.escalation import advance_from
        _, next_type = advance_from(emergency, esc.contact_type, actor=request.user, reason=decision)
        return Response(self.get_serializer(emergency, context={"request": request}).data)

    @action(detail=True, methods=["patch"], url_path="resident-cancel")
    def resident_cancel(self, request, pk=None):
        emergency = self.get_object()
        if request.user.id != emergency.user_id:
            return Response({"error": "Only the resident who created this emergency can cancel it."}, status=403)
        if emergency.status in {"RESOLVED", "CANCELLED", "AUTO_CLOSED"}:
            return Response({"error": "This emergency is already closed."}, status=400)
        reason = str(request.data.get("reason", "ACCIDENTAL_OR_NO_LONGER_NEEDED"))
        comment = str(request.data.get("comment", ""))
        now = timezone.now()
        emergency.status = "CANCELLED"
        emergency.assigned_security = None
        emergency.assigned_volunteer = None
        emergency.save(update_fields=["status", "assigned_security", "assigned_volunteer"])
        emergency.escalations.filter(response_status="WAITING").update(response_status="CANCELLED", cancelled_at=now, cancel_reason=reason, cancel_comment=comment)
        for responder in [emergency.assigned_security, emergency.assigned_volunteer]:
            if responder and responder.volunteer_status == "BUSY":
                responder.volunteer_status = "AVAILABLE"
                responder.save(update_fields=["volunteer_status"])
        for helper in emergency.additional_responders.all():
            if helper.volunteer_status == "BUSY":
                helper.volunteer_status = "AVAILABLE"
                helper.save(update_fields=["volunteer_status"])
        emergency.additional_responders.clear()
        audit(emergency, request.user, "RESIDENT_CANCELLED", f"Reason={reason}; {comment}")
        notify(request.user, emergency, "Emergency Cancelled", f"Emergency #{emergency.id} was cancelled by you.")
        return Response(self.get_serializer(emergency, context={"request": request}).data)

    @action(detail=True, methods=["patch"], url_path="still-need-help")
    def still_need_help(self, request, pk=None):
        emergency = self.get_object()
        if request.user.id != emergency.user_id:
            return Response({"error": "Only the resident who created this emergency can request more help."}, status=403)
        if emergency.status != "RESOLVED":
            return Response({"error": "This action is available only after resolution."}, status=400)
        emergency.escalations.filter(response_status="ACCEPTED").update(response_status="CANCELLED", cancelled_at=timezone.now(), cancel_reason="NEW_RESPONSE_CYCLE")
        emergency.assigned_security = None
        emergency.assigned_volunteer = None
        emergency.status = "PENDING"
        for helper in emergency.additional_responders.all():
            if helper.volunteer_status == "BUSY":
                helper.volunteer_status = "AVAILABLE"
                helper.save(update_fields=["volunteer_status"])
        emergency.additional_responders.clear()
        emergency.resolved_at = None
        emergency.save(update_fields=["status", "assigned_security",
                                      "assigned_volunteer", "resolved_at"])
        audit(emergency, request.user, "NEW_RESPONSE_CYCLE", "Resident reported that assistance is still needed after resolution.")
        from api.services.escalation import start_emergency_escalation
        start_emergency_escalation(emergency)
        notify(request.user, emergency, "New Response Cycle Started", f"Emergency #{emergency.id} has been reopened for another response cycle.")
        return Response(self.get_serializer(emergency, context={"request": request}).data)

    @action(detail=True, methods=["patch"])
    def resolve(self, request, pk=None):
        emergency = self.get_object()
        accepted_escalation = emergency.escalations.filter(
            responder=request.user, response_status="ACCEPTED"
        ).order_by("-responded_at", "-created_at").first()
        can_resolve = (
            request.user.role == "ADMIN"
            or request.user.id in {emergency.assigned_security_id, emergency.assigned_volunteer_id}
            or bool(accepted_escalation)
        )
        if not can_resolve:
            return Response({"error": "Only the assigned responder or an authorized admin can resolve this emergency."}, status=403)
        if emergency.status == "RESOLVED":
            return Response({"error": "Emergency is already resolved."}, status=400)
        note = request.data.get("closure_note", "")
        emergency.status = "RESOLVED"; emergency.resolved_at = timezone.now(); emergency.closure_note = note
        emergency.save(update_fields=["status", "resolved_at", "closure_note"])
        for responder in [emergency.assigned_security, emergency.assigned_volunteer]:
            if responder:
                responder.volunteer_status = "AVAILABLE"; responder.save(update_fields=["volunteer_status"])
        for helper in emergency.additional_responders.all():
            if helper.volunteer_status == "BUSY":
                helper.volunteer_status = "AVAILABLE"
                helper.save(update_fields=["volunteer_status"])
        audit(emergency, request.user, "INCIDENT_RESOLVED", note or "Incident resolved.")
        notify(emergency.user, emergency, "Emergency Resolved", f"Emergency #{emergency.id} has been resolved.")
        return Response(self.get_serializer(emergency, context={"request": request}).data)

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        emergency = self.get_object()
        return Response(AuditLogSerializer(emergency.audit_logs.order_by("created_at"), many=True).data)

    @action(detail=False, methods=["get"])
    def analytics(self, request):
        qs = self.get_queryset()
        resolved = qs.filter(resolved_at__isnull=False, created_at__isnull=False)
        response_minutes = []
        for e in resolved:
            response_at = e.accepted_at or e.assistance_started_at
            if response_at:
                response_minutes.append((response_at - e.created_at).total_seconds() / 60)
        avg_response = round(sum(response_minutes) / len(response_minutes), 2) if response_minutes else 0
        return Response({
            "total": qs.count(),
            "pending": qs.filter(status="PENDING").count(),
            "assigned": qs.filter(status="ASSIGNED").count(),
            "in_progress": qs.filter(status="IN_PROGRESS").count(),
            "resolved": qs.filter(status="RESOLVED").count(),
            "critical": qs.filter(priority="CRITICAL").count(),
            "average_response_minutes": avg_response,
            "by_type": list(qs.values("emergency_type").annotate(count=Count("id")).order_by("-count")),
            "by_priority": list(qs.values("priority").annotate(count=Count("id")).order_by("-count")),
            "by_block": list(
                qs.values("user__block__name")
                .annotate(count=Count("id"))
                .order_by("-count")[:12]
            ),
            "daily_trend": list(reversed(list(
                qs.values("created_at__date")
                .annotate(count=Count("id"))
                .order_by("-created_at__date")[:14]
            ))),
        })


class ChatMessageViewSet(viewsets.ModelViewSet):
    serializer_class = ChatMessageSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "head", "options"]

    def _allowed(self, emergency):
        user = self.request.user
        if emergency.user_id == user.id:
            return True
        if user.role == "ADMIN":
            return is_platform_admin(user) or emergency.user.society_id == user.society_id
        if user.society_id and emergency.user.society_id != user.society_id:
            return False
        if emergency.assigned_security_id == user.id or emergency.assigned_volunteer_id == user.id or emergency.additional_responders.filter(id=user.id).exists():
            return True
        if EmergencyEscalation.objects.filter(emergency=emergency, responder=user, response_status="ACCEPTED").exists():
            return True
        if user.role in {"RESIDENT", "GUARDIAN"}:
            return Guardian.objects.filter(user=user, resident_id=emergency.user_id, relationship_status="ACCEPTED", is_active=True).exists() or EmergencyEscalation.objects.filter(emergency=emergency, guardian__user=user, response_status__in=["WAITING", "ACCEPTED"]).exists()
        return False

    def get_queryset(self):
        emergency_id = self.request.query_params.get("emergency")
        if not emergency_id:
            return ChatMessage.objects.none()
        try:
            emergency = Emergency.objects.get(pk=emergency_id)
        except Emergency.DoesNotExist:
            return ChatMessage.objects.none()
        if not self._allowed(emergency):
            return ChatMessage.objects.none()
        return ChatMessage.objects.filter(emergency=emergency).select_related("sender")

    def create(self, request, *args, **kwargs):
        emergency_id = request.data.get("emergency")
        text = str(request.data.get("message", "")).strip()
        if not emergency_id or not text:
            return Response({"error": "Emergency and message are required."}, status=400)
        emergency = get_object_or_404(Emergency, pk=emergency_id)
        if not self._allowed(emergency):
            return Response({"error": "You are not authorized to use this incident chat."}, status=403)
        if emergency.status in {"RESOLVED", "CANCELLED", "AUTO_CLOSED"}:
            return Response({"error": "This incident chat is read-only after the incident is closed."}, status=400)
        msg = ChatMessage.objects.create(emergency=emergency, sender=request.user, message=text)
        audit(emergency, request.user, "CHAT_MESSAGE", text[:200])
        # Notify other incident participants through the existing notification layer.
        participant_ids = set([emergency.user_id, emergency.assigned_security_id, emergency.assigned_volunteer_id])
        participant_ids.update(emergency.additional_responders.values_list("id", flat=True))
        participant_ids.update(EmergencyEscalation.objects.filter(emergency=emergency, response_status__in=["WAITING", "ACCEPTED"]).values_list("responder_id", flat=True))
        participant_ids.discard(None); participant_ids.discard(request.user.id)
        for uid in participant_ids:
            try:
                notify(User.objects.get(id=uid), emergency, "New Emergency Chat Message", f"{request.user.get_full_name() or request.user.username}: {text[:120]}")
            except User.DoesNotExist:
                pass
        return Response(self.get_serializer(msg).data, status=201)


# ---------------------------- notifications ----------------------------
class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.request.user.role == "ADMIN":
            qs = Notification.objects.all().order_by("-created_at")
            if not is_platform_admin(self.request.user):
                qs = qs.filter(user__society_id=self.request.user.society_id)
            return qs
        return Notification.objects.filter(user=self.request.user).order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=["patch"])
    def read(self, request, pk=None):
        n = self.get_object()
        n.is_read = True; n.read_at = timezone.now(); n.save(update_fields=["is_read", "read_at"])
        return Response(self.get_serializer(n).data)

    @action(detail=False, methods=["patch"])
    def read_all(self, request):
        now = timezone.now()
        self.get_queryset().filter(is_read=False).update(is_read=True, read_at=now)
        return Response({"message": "All notifications marked as read."})


class ResponderLocationView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = ResponderLocation.objects.filter(responder__role__in=["VOLUNTEER", "SECURITY"])
        user = request.user
        if user.role in ["VOLUNTEER", "SECURITY"]:
            qs = qs.filter(responder=user)
        elif user.role == "ADMIN":
            if not is_platform_admin(user):
                qs = qs.filter(responder__society_id=user.society_id)
        elif user.role in ["RESIDENT", "GUARDIAN"]:
            guardian_resident_ids = Guardian.objects.filter(user=user, relationship_status="ACCEPTED", is_active=True).values_list("resident_id", flat=True)
            active_emergencies = Emergency.objects.filter(
                Q(user=user) | Q(user_id__in=guardian_resident_ids),
                status__in=["ASSIGNED", "IN_PROGRESS"]
            )
            responder_ids = set()
            for em in active_emergencies:
                if em.assigned_security_id:
                    responder_ids.add(em.assigned_security_id)
                if em.assigned_volunteer_id:
                    responder_ids.add(em.assigned_volunteer_id)
                responder_ids.update(em.additional_responders.values_list("id", flat=True))
            qs = qs.filter(responder_id__in=responder_ids)
        else:
            qs = qs.none()
        return Response(ResponderLocationSerializer(qs.select_related("responder"), many=True).data)

    def post(self, request):
        if request.user.role not in ["VOLUNTEER", "SECURITY"]:
            return Response({"error": "Only responders can publish a live location."}, status=403)
        serializer = ResponderLocationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        obj, _ = ResponderLocation.objects.update_or_create(responder=request.user, defaults=serializer.validated_data)
        return Response(ResponderLocationSerializer(obj).data)



class ResponderMembershipRequestViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def _data(self, obj):
        return {"id": obj.id, "responder": obj.responder_id, "responder_name": obj.responder.get_full_name() or obj.responder.username, "society": obj.society_id, "society_name": obj.society.name, "role": obj.role, "direction": obj.direction, "status": obj.status, "created_at": obj.created_at, "responded_at": obj.responded_at}

    def list(self, request, *args, **kwargs):
        u=request.user
        if u.role=="ADMIN":
            qs=ResponderMembershipRequest.objects.select_related("responder","society").all() if is_platform_admin(u) else ResponderMembershipRequest.objects.select_related("responder","society").filter(society_id=u.society_id)
        elif u.role in {"SECURITY","VOLUNTEER"}:
            qs=ResponderMembershipRequest.objects.select_related("responder","society").filter(responder=u)
        else:
            qs=ResponderMembershipRequest.objects.none()
        return Response([self._data(x) for x in qs.order_by("-created_at")])

    def create(self, request, *args, **kwargs):
        if request.user.role not in {"SECURITY","VOLUNTEER"}: return Response({"error":"Only Security or Volunteer can request society membership."},status=403)
        society_id=request.data.get("society") or request.user.society_id
        society=get_object_or_404(Society,pk=society_id)
        if request.user.society_id and int(request.user.society_id)!=int(society.id): return Response({"error":"You cannot request membership in another society while assigned to a society."},status=403)
        if responder_membership_approved(request.user,society.id): return Response({"error":"You are already approved for this society."},status=400)
        ResponderMembershipRequest.objects.filter(responder=request.user,society=society,status="PENDING").update(status="DECLINED",responded_at=timezone.now())
        obj=ResponderMembershipRequest.objects.create(responder=request.user,society=society,role=request.user.role,direction="REQUEST",status="PENDING",requested_by=request.user)
        
        admins = User.objects.filter(role="ADMIN", society=society)
        if not admins.exists():
            admins = User.objects.filter(role="ADMIN", is_superuser=True)
        for admin in admins:
            notify(
                admin,
                emergency=None,
                title=f"{request.user.role.title()} Membership Request",
                message=f"{request.user.get_full_name() or request.user.username} requested to join {society.name} as {request.user.role.title()}."
            )
        return Response(self._data(obj),status=201)

    @action(detail=True, methods=["post"], url_path="accept")
    def accept(self, request, pk=None):
        obj=get_object_or_404(ResponderMembershipRequest.objects.select_related("responder","society"),pk=pk)
        if obj.status!="PENDING": return Response({"error":"This request is no longer pending."},status=400)
        allowed=(request.user.id==obj.responder_id and obj.direction=="INVITE") or (request.user.role=="ADMIN" and ensure_admin_scope(request.user,obj.society_id) and obj.direction=="REQUEST")
        if not allowed: return Response({"error":"You are not allowed to accept this request."},status=403)
        obj.status="ACCEPTED"; obj.responded_at=timezone.now(); obj.responder.society=obj.society; obj.responder.is_verified=True; obj.responder.save(update_fields=["society","is_verified"]); obj.save(update_fields=["status","responded_at"])
        
        if obj.direction == "REQUEST":
            notify(
                obj.responder,
                emergency=None,
                title="Society Membership Approved",
                message=f"Your membership request for {obj.society.name} as {obj.role.title()} has been approved."
            )
        elif obj.requested_by and obj.requested_by_id != request.user.id:
            notify(
                obj.requested_by,
                emergency=None,
                title="Society Invitation Accepted",
                message=f"{obj.responder.get_full_name() or obj.responder.username} accepted the invitation to join {obj.society.name} as {obj.role.title()}."
            )
        return Response(self._data(obj))

    @action(detail=True, methods=["post"], url_path="decline")
    def decline(self, request, pk=None):
        obj=get_object_or_404(ResponderMembershipRequest.objects.select_related("responder", "society"),pk=pk)
        allowed=(request.user.id==obj.responder_id and obj.direction=="INVITE") or (request.user.role=="ADMIN" and ensure_admin_scope(request.user,obj.society_id))
        if not allowed: return Response({"error":"You are not allowed to decline this request."},status=403)
        obj.status="DECLINED"; obj.responded_at=timezone.now(); obj.save(update_fields=["status","responded_at"])
        if obj.direction == "INVITE" and obj.requested_by and obj.requested_by_id != request.user.id:
            notify(
                obj.requested_by,
                emergency=None,
                title="Society Invitation Declined",
                message=f"{obj.responder.get_full_name() or obj.responder.username} declined the invitation to join {obj.society.name}."
            )
        elif obj.direction == "REQUEST":
            notify(
                obj.responder,
                emergency=None,
                title="Society Membership Request Declined",
                message=f"Your membership request for {obj.society.name} as {obj.role.title()} was declined."
            )
        return Response(self._data(obj))

    def destroy(self, request, pk=None):
        obj = get_object_or_404(ResponderMembershipRequest.objects.select_related("responder", "society"), pk=pk)
        allowed = (request.user.id == obj.requested_by_id) or (request.user.id == obj.responder_id) or (request.user.role == "ADMIN" and ensure_admin_scope(request.user, obj.society_id))
        if not allowed:
            return Response({"error": "You are not allowed to delete this invitation record."}, status=403)
        obj.delete()
        return Response({"message": "Invitation record deleted successfully."}, status=200)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        obj = get_object_or_404(ResponderMembershipRequest.objects.select_related("responder", "society"), pk=pk)
        allowed = (request.user.id == obj.requested_by_id) or (request.user.id == obj.responder_id) or (request.user.role == "ADMIN" and ensure_admin_scope(request.user, obj.society_id))
        if not allowed:
            return Response({"error": "You are not allowed to cancel this request."}, status=403)
        obj.status = "CANCELLED"
        obj.responded_at = timezone.now()
        obj.save(update_fields=["status", "responded_at"])
        return Response(self._data(obj))

    @action(detail=False, methods=["post"], url_path="invite")
    def invite(self, request):
        if request.user.role!="ADMIN": return Response({"error":"Admin access required."},status=403)
        society_id=request.data.get("society") or request.user.society_id
        if not ensure_admin_scope(request.user,society_id): return Response({"error":"You cannot invite a responder outside your society."},status=403)
        responder_id=request.data.get("responder")
        responder=get_object_or_404(User,pk=responder_id,role__in=["SECURITY","VOLUNTEER"])
        society=get_object_or_404(Society,pk=society_id)
        if responder.society_id not in {None,society.id}: return Response({"error":"Responder belongs to another society."},status=400)
        if responder_membership_approved(responder, society.id): return Response({"error":"This responder is already approved for this society."},status=400)
        if ResponderMembershipRequest.objects.filter(responder=responder, society=society, direction="INVITE", status="PENDING").exists():
            return Response({"error":"An invitation for this responder is already pending for this society."},status=400)
        obj=ResponderMembershipRequest.objects.create(responder=responder,society=society,role=responder.role,direction="INVITE",status="PENDING",requested_by=request.user)
        
        notify(
            responder,
            emergency=None,
            title=f"Society {responder.role.title()} Invitation",
            message=f"Admin from {society.name} invited you to join as {responder.role.title()}."
        )
        return Response(self._data(obj),status=201)

# ---------------------------- dashboards ----------------------------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard(request):
    if request.user.role != "ADMIN":
        return Response({"error": "Admin access required."}, status=403)
    platform = is_platform_admin(request.user)
    society_qs = Society.objects.all() if platform else Society.objects.filter(pk=request.user.society_id)
    user_qs = User.objects.all() if platform else User.objects.filter(society_id=request.user.society_id)
    emergency_qs = Emergency.objects.all() if platform else Emergency.objects.filter(user__society_id=request.user.society_id)
    notification_qs = Notification.objects.all() if platform else Notification.objects.filter(user__society_id=request.user.society_id)
    from accounts.models import Guardian as GuardianModel
    guardian_qs = GuardianModel.objects.all() if platform else GuardianModel.objects.filter(resident__society_id=request.user.society_id)
    resolved = emergency_qs.filter(resolved_at__isnull=False, accepted_at__isnull=False)
    response_values = [(e.accepted_at - e.created_at).total_seconds() / 60 for e in resolved]
    avg_response = round(sum(response_values) / len(response_values), 2) if response_values else 0
    society = request.user.society if request.user.society_id else None
    return Response({
        "scope": "PLATFORM" if platform else "SOCIETY",
        "society": {"id": society.id, "name": society.name} if society else None,
        "total_users": user_qs.count(),
        "total_residents": user_qs.filter(role="RESIDENT").count(),
        # Guardian count = Guardian relationships (not User.role=="GUARDIAN")
        "total_guardians": guardian_qs.count(),
        "total_volunteers": user_qs.filter(role="VOLUNTEER").count(),
        "total_security": user_qs.filter(role="SECURITY").count(),
        "available_volunteers": user_qs.filter(role="VOLUNTEER", volunteer_status="AVAILABLE").count(),
        "available_security": user_qs.filter(role="SECURITY", volunteer_status="AVAILABLE").count(),
        # Guardian availability is not tracked; omit misleading metric.
        "total_societies": society_qs.count(),
        "total_emergencies": emergency_qs.count(),
        "pending_emergencies": emergency_qs.filter(status="PENDING").count(),
        "assigned_emergencies": emergency_qs.filter(status="ASSIGNED").count(),
        "in_progress_emergencies": emergency_qs.filter(status="IN_PROGRESS").count(),
        "resolved_emergencies": emergency_qs.filter(status="RESOLVED").count(),
        "total_notifications": notification_qs.count(),
        "unread_notifications": notification_qs.filter(is_read=False).count(),
        "average_response_minutes": avg_response,
    })


@api_view(["GET"])
@permission_classes([AllowAny])
def registration_options(request):
    society_id = request.query_params.get("society")
    block_id = request.query_params.get("block")

    if block_id:
        flats = list(Flat.objects.filter(block_id=block_id).values("id", "block_id", "flat_number", "floor").order_by("floor", "flat_number"))
        return Response({"flats": flats, "blocks": [], "societies": []})
    elif society_id:
        blocks = list(Block.objects.filter(society_id=society_id).values("id", "society_id", "name").order_by("name"))
        return Response({"blocks": blocks, "societies": [], "flats": []})
    else:
        societies = list(Society.objects.values("id", "name").order_by("name"))
        return Response({
            "societies": societies,
            "blocks": [],
            "flats": [],
        })


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsResident])
def sos(request):
    emergency_type = request.data.get("emergency_type", "OTHER")
    valid = {x[0] for x in Emergency.EMERGENCY_TYPES}
    if emergency_type not in valid:
        emergency_type = "OTHER"
    emergency = Emergency.objects.create(
        user=request.user,
        emergency_type=emergency_type,
        description=request.data.get("description", "Emergency triggered using SOS button."),
        location=request.data.get("location", "Location unavailable"),
        latitude=request.data.get("latitude"),
        longitude=request.data.get("longitude"),
        category_auto_selected=bool(request.data.get("category_auto_selected", False)),
        priority=request.data.get("priority", "CRITICAL"),
        category_selected_at=timezone.now(),
    )
    audit(emergency, request.user, "SOS_CREATED", "SOS activated from resident dashboard.")
    notify(request.user, emergency, "SOS Triggered", f"Emergency #{emergency.id} has been created.")
    # Start the strict escalation chain. Only the current stage is notified:
    # PRIMARY -> SECONDARY -> EMERGENCY -> SECURITY -> VOLUNTEER -> PENDING.
    from api.services.escalation import start_emergency_escalation
    start_emergency_escalation(emergency)
    return Response(EmergencySerializer(emergency, context={"request": request}).data, status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def process_escalation(request, emergency_id):
    try:
        emergency = Emergency.objects.select_related("user").get(pk=emergency_id)
    except Emergency.DoesNotExist:
        return Response({"error": "Emergency not found."}, status=404)

    user = request.user
    allowed = (
        user.role == "ADMIN" and (
            is_platform_admin(user) or emergency.user.society_id == user.society_id
        )
    ) or (
        user.role == "RESIDENT" and emergency.user_id == user.id
    ) or (
        user.role in {"RESIDENT", "GUARDIAN"}
        and Guardian.objects.filter(user=user, resident_id=emergency.user_id, relationship_status="ACCEPTED", is_active=True).exists()
    ) or (
        user.role in {"SECURITY", "VOLUNTEER"}
        and emergency.user.society_id == user.society_id
    )
    if not allowed:
        return Response({"error": "You cannot process escalation for this emergency."}, status=403)

    result, http_status = process_emergency_escalation(emergency_id)
    return Response(result, status=http_status)
