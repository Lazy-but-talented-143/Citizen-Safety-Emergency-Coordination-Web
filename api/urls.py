from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework.permissions import AllowAny

from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

from .views import (
    RegisterUserView,
    ProfileView,
    SocietyViewSet,
    BlockViewSet,
    FlatViewSet,
    GuardianViewSet,
    EmergencyViewSet,
    NotificationViewSet,
    dashboard,
    sos,
    VolunteerStatusView,
)

# Custom Login View
class LoginView(TokenObtainPairView):
    permission_classes = [AllowAny]

# Custom Refresh View
class RefreshView(TokenRefreshView):
    permission_classes = [AllowAny]

# Router
router = DefaultRouter()

router.register("societies", SocietyViewSet)
router.register("blocks", BlockViewSet)
router.register("flats", FlatViewSet)
router.register("guardians", GuardianViewSet)
router.register("emergencies", EmergencyViewSet)
router.register("notifications", NotificationViewSet)

# URLs
urlpatterns = [
    path("register/", RegisterUserView.as_view()),
    path("login/", LoginView.as_view()),
    path("refresh/", RefreshView.as_view()),
    path("profile/", ProfileView.as_view()),
    path(
        "profile/volunteer-status/",
        VolunteerStatusView.as_view()
    ),
    path("dashboard/", dashboard),
    path("sos/", sos),
    path("", include(router.urls)),
]