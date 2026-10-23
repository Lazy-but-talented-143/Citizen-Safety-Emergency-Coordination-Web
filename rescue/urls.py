from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

from django.http import JsonResponse

def health_check(request):
    return JsonResponse({"status": "ok", "app": "citizen-safety"})

urlpatterns = [
    path("", health_check),
    path("healthz", health_check),
    path("admin/", admin.site.urls),
    path("api/", include("api.urls")),
]
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
