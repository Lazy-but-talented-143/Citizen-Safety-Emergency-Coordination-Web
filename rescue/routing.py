from django.urls import re_path
from .consumers import NotificationConsumer, ChatConsumer

websocket_urlpatterns = [
    re_path(r"ws/notifications/$", NotificationConsumer.as_asgi()),
    re_path(r"ws/emergencies/(?P<emergency_id>\d+)/chat/$", ChatConsumer.as_asgi()),
]

