from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework.permissions import AllowAny
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import (
    RegisterUserView, ProfileView, ChangePasswordView, PasswordResetRequestView, PasswordResetConfirmView,
    UserViewSet, SocietyViewSet, BlockViewSet, FlatViewSet, GuardianViewSet, EmergencyViewSet,
    NotificationViewSet, ChatMessageViewSet, ResponderMembershipRequestViewSet, ResponderLocationView, dashboard, registration_options, sos, process_escalation, VolunteerStatusView, AdminProvisionView,
    health_check, readiness_check, SendOTPView, VerifyOTPView, OTPLoginView, OTPPasswordResetView,
)

class LoginView(TokenObtainPairView):
    permission_classes = [AllowAny]

class RefreshView(TokenRefreshView):
    permission_classes = [AllowAny]

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")
router.register("societies", SocietyViewSet)
router.register("blocks", BlockViewSet)
router.register("flats", FlatViewSet)
router.register("guardians", GuardianViewSet, basename="guardian")
router.register("emergencies", EmergencyViewSet, basename="emergency")
router.register("notifications", NotificationViewSet, basename="notification")
router.register("chat-messages", ChatMessageViewSet, basename="chat-message")
router.register("responder-requests", ResponderMembershipRequestViewSet, basename="responder-request")

urlpatterns = [
    path("register/", RegisterUserView.as_view()),
    path("admins/", AdminProvisionView.as_view()),
    path("login/", LoginView.as_view()),

    path("otp/send/", SendOTPView.as_view()),
    path("otp/verify/", VerifyOTPView.as_view()),
    path("otp/login/", OTPLoginView.as_view()),
    path("otp/reset-password/", OTPPasswordResetView.as_view()),

    path("refresh/", RefreshView.as_view()),
    path("profile/", ProfileView.as_view()),
    path("profile/change-password/", ChangePasswordView.as_view()),
    path("password-reset/", PasswordResetRequestView.as_view()),
    path("password-reset/confirm/", PasswordResetConfirmView.as_view()),
    path("profile/volunteer-status/", VolunteerStatusView.as_view()),
    path("profile/location/", ResponderLocationView.as_view()),
    path("dashboard/", dashboard),
    path("registration-options/", registration_options),
    path("health/", health_check),
    path("health/readiness/", readiness_check),
    path("sos/", sos),
    path("emergencies/<int:emergency_id>/process-escalation/", process_escalation),
    path("", include(router.urls)),
]

