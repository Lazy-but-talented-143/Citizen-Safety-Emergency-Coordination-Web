try:
    from channels.generic.websocket import AsyncJsonWebsocketConsumer
except ImportError:
    AsyncJsonWebsocketConsumer = None


if AsyncJsonWebsocketConsumer:
    class NotificationConsumer(AsyncJsonWebsocketConsumer):
        async def connect(self):
            if self.scope.get("user") and self.scope["user"].is_authenticated:
                self.group_name = f"notifications_{self.scope['user'].id}"
                await self.channel_layer.group_add(self.group_name, self.channel_name)
                await self.accept()
            else:
                await self.close(code=4401)

        async def disconnect(self, close_code):
            if hasattr(self, "group_name"):
                await self.channel_layer.group_discard(self.group_name, self.channel_name)

        async def notification_message(self, event):
            await self.send_json(event["payload"])

    class ChatConsumer(AsyncJsonWebsocketConsumer):
        active_connections = {}  # room_group_name -> dict(channel_name -> user_dict)

        async def connect(self):
            self.emergency_id = self.scope["url_route"]["kwargs"]["emergency_id"]
            user = self.scope.get("user")
            if not user or not user.is_authenticated:
                await self.close(code=4401)
                return
            from channels.db import database_sync_to_async
            allowed = await database_sync_to_async(self._check_access)(user, self.emergency_id)
            if not allowed:
                await self.close(code=4403)
                return
            self.room_group_name = f"chat_emergency_{self.emergency_id}"
            await self.channel_layer.group_add(self.room_group_name, self.channel_name)
            await self.accept()

            if self.room_group_name not in ChatConsumer.active_connections:
                ChatConsumer.active_connections[self.room_group_name] = {}
            ChatConsumer.active_connections[self.room_group_name][self.channel_name] = {
                "id": user.id,
                "username": user.username,
                "name": user.get_full_name() or user.username,
            }
            await self.broadcast_presence()

        def _check_access(self, user, emergency_id):
            from emergency.models import Emergency, EmergencyEscalation
            from api.services.platform import is_platform_admin
            try:
                emergency = Emergency.objects.get(pk=emergency_id)
            except Emergency.DoesNotExist:
                return False
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
                from accounts.models import Guardian
                return Guardian.objects.filter(user=user, resident_id=emergency.user_id, relationship_status="ACCEPTED", is_active=True).exists() or EmergencyEscalation.objects.filter(emergency=emergency, guardian__user=user, response_status__in=["WAITING", "ACCEPTED"]).exists()
            return False

        async def broadcast_presence(self):
            room = getattr(self, "room_group_name", None)
            if not room:
                return
            members_dict = ChatConsumer.active_connections.get(room, {})
            # Deduplicate members by user ID
            unique_members = {}
            for member in members_dict.values():
                unique_members[member["id"]] = member
            active_list = list(unique_members.values())

            await self.channel_layer.group_send(
                room,
                {
                    "type": "presence_update",
                    "payload": {
                        "type": "presence",
                        "active_count": len(active_list),
                        "active_members": active_list,
                    }
                }
            )

        async def disconnect(self, close_code):
            if hasattr(self, "room_group_name"):
                if self.room_group_name in ChatConsumer.active_connections:
                    ChatConsumer.active_connections[self.room_group_name].pop(self.channel_name, None)
                    if not ChatConsumer.active_connections[self.room_group_name]:
                        ChatConsumer.active_connections.pop(self.room_group_name, None)
                await self.broadcast_presence()
                await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

        async def receive_json(self, content):
            user = self.scope.get("user")
            text = str(content.get("message", "")).strip()
            if not user or not user.is_authenticated or not text:
                return
            from channels.db import database_sync_to_async
            msg_data = await database_sync_to_async(self._save_message)(user, self.emergency_id, text)
            if msg_data:
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {"type": "chat_message", "payload": msg_data}
                )

        def _save_message(self, user, emergency_id, text):
            from emergency.models import Emergency, ChatMessage
            from api.services.escalation import audit, notify
            from accounts.models import User
            try:
                emergency = Emergency.objects.get(pk=emergency_id)
            except Emergency.DoesNotExist:
                return None
            if not self._check_access(user, emergency_id):
                return None
            if emergency.status in {"RESOLVED", "CANCELLED", "AUTO_CLOSED"}:
                return None
            msg = ChatMessage.objects.create(emergency=emergency, sender=user, message=text)
            audit(emergency, user, "CHAT_MESSAGE", text[:200])
            # Broadcast to WS
            from api.serializers import ChatMessageSerializer
            serialized = ChatMessageSerializer(msg).data
            return serialized

        async def chat_message(self, event):
            await self.send_json(event["payload"])

        async def presence_update(self, event):
            await self.send_json(event["payload"])

else:
    class NotificationConsumer:
        @classmethod
        def as_asgi(cls):
            async def app(scope, receive, send):
                await send({"type": "websocket.close", "code": 1011})
            return app

    class ChatConsumer:
        @classmethod
        def as_asgi(cls):
            async def app(scope, receive, send):
                await send({"type": "websocket.close", "code": 1011})
            return app

