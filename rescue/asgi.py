import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "rescue.settings")

try:
    from channels.routing import ProtocolTypeRouter, URLRouter
    from .ws_auth import JWTAuthMiddleware
    from django.core.asgi import get_asgi_application
    from .routing import websocket_urlpatterns
    application = ProtocolTypeRouter({
        "http": get_asgi_application(),
        "websocket": JWTAuthMiddleware(URLRouter(websocket_urlpatterns)),
    })
except ImportError:
    from django.core.asgi import get_asgi_application
    application = get_asgi_application()
