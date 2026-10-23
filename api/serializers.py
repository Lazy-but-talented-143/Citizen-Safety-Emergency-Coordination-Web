from rest_framework import serializers
import secrets
import string
from accounts.models import User, Guardian
from society.models import Society, Block, Flat
from emergency.models import Emergency, EmergencyEscalation, Notification, AuditLog, ResponderLocation, ChatMessage


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)
    profile_photo_url = serializers.SerializerMethodField()
    is_platform_admin = serializers.SerializerMethodField()
    society_name = serializers.CharField(source="society.name", read_only=True)
    block_name = serializers.CharField(source="block.name", read_only=True)
    flat_number = serializers.CharField(source="flat.flat_number", read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "username", "first_name", "last_name", "email", "password", "phone", "address",
            "role", "society", "society_name", "block", "block_name", "flat", "flat_number",
            "volunteer_status", "is_verified", "is_active", "is_platform_admin", "profile_photo", "profile_photo_url",
        ]
        read_only_fields = ["is_verified", "is_platform_admin", "profile_photo_url"]

    def get_is_platform_admin(self, obj):
        from api.services.platform import is_platform_admin
        return is_platform_admin(obj)

    def get_profile_photo_url(self, obj):
        request = self.context.get("request")
        if obj.profile_photo:
            url = obj.profile_photo.url
            return request.build_absolute_uri(url) if request else url
        return None

    def validate(self, attrs):
        request = self.context.get("request")
        actor = getattr(request, "user", None)
        role = attrs.get("role", getattr(self.instance, "role", None))
        from api.services.platform import is_platform_admin

        # ADMIN accounts can be created through public registration or controlled Platform Admin provisioning
        if role == "ADMIN":
            if self.instance is None:
                request = self.context.get("request")
                actor = getattr(request, "user", None)
                if not (actor and getattr(actor, "is_authenticated", False)
                        and is_platform_admin(actor)):
                    raise serializers.ValidationError({
                        "role": "Admin accounts can only be created by a platform administrator."
                    })
            elif actor and actor.is_authenticated and not is_platform_admin(actor):
                raise serializers.ValidationError({"role": "ADMIN accounts cannot be modified through this endpoint."})

        # A society admin may only manage users inside their own society.
        if actor and getattr(actor, "role", None) == "ADMIN" and actor.is_authenticated and not is_platform_admin(actor):
            if self.instance and "role" in attrs and attrs["role"] != self.instance.role:
                raise serializers.ValidationError({"role": "Society administrators cannot change user roles."})
            requested_society = attrs.get("society", getattr(self.instance, "society", None))
            if requested_society and requested_society.id != actor.society_id:
                raise serializers.ValidationError({"society": "You cannot assign a user to another society."})
            if self.instance and self.instance.society_id != actor.society_id:
                raise serializers.ValidationError({"society": "You cannot modify a user outside your society."})

        society = attrs.get("society", getattr(self.instance, "society", None))
        block = attrs.get("block", getattr(self.instance, "block", None))
        flat = attrs.get("flat", getattr(self.instance, "flat", None))
        if actor and getattr(actor, "role", None) == "ADMIN" and actor.is_authenticated and not (actor.is_superuser and actor.role == "ADMIN"):
            society = society or actor.society
        if block and not society:
            raise serializers.ValidationError({"block": "A block requires a society."})
        if flat and not block:
            raise serializers.ValidationError({"flat": "A flat requires a block."})
        if block and society and block.society_id != society.id:
            raise serializers.ValidationError({"block": "Block does not belong to the selected society."})
        if flat and block and flat.block_id != block.id:
            raise serializers.ValidationError({"flat": "Flat does not belong to the selected block."})
        if flat and society and flat.block.society_id != society.id:
            raise serializers.ValidationError({"flat": "Flat does not belong to the selected society."})
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        user = User(**validated_data)
        if not password:
            alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
            password = "".join(secrets.choice(alphabet) for _ in range(16))
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class SocietySerializer(serializers.ModelSerializer):
    block_count = serializers.SerializerMethodField()

    class Meta:
        model = Society
        fields = ["id", "name", "address", "city", "state", "pincode", "block_count"]

    def get_block_count(self, obj):
        return obj.blocks.count()


class BlockSerializer(serializers.ModelSerializer):
    class Meta:
        model = Block
        fields = "__all__"


class FlatSerializer(serializers.ModelSerializer):
    class Meta:
        model = Flat
        fields = "__all__"


class GuardianSerializer(serializers.ModelSerializer):
    linked_username = serializers.CharField(source="user.username", read_only=True)
    resident_username = serializers.CharField(source="resident.username", read_only=True)
    resident_name = serializers.SerializerMethodField()

    class Meta:
        model = Guardian
        fields = [
            "id", "resident", "resident_username", "resident_name", "user", "linked_username", "name", "relation", "phone", "email", "address",
            "guardian_type", "is_verified", "is_active", "relationship_status", "requested_by", "created_at",
            "accepted_at", "declined_at", "cancelled_at", "revoked_at",
        ]
        read_only_fields = [
            "resident", "resident_username", "resident_name", "is_verified", "created_at", "user", "linked_username", "relationship_status", "requested_by",
            "accepted_at", "declined_at", "cancelled_at", "revoked_at",
        ]

    def get_resident_name(self, obj):
        if not obj.resident:
            return ""
        full_name = f"{obj.resident.first_name} {obj.resident.last_name}".strip()
        return full_name or obj.resident.username


class EmergencyEscalationSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmergencyEscalation
        fields = "__all__"


class AuditLogSerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(source="actor.username", read_only=True)

    class Meta:
        model = AuditLog
        fields = ["id", "emergency", "actor", "actor_username", "action", "details", "created_at"]


class EmergencySerializer(serializers.ModelSerializer):
    escalations = EmergencyEscalationSerializer(many=True, read_only=True)
    audit_logs = AuditLogSerializer(many=True, read_only=True)
    requester_username = serializers.CharField(source="user.username", read_only=True)
    requester_name = serializers.SerializerMethodField()
    requester_phone = serializers.CharField(source="user.phone", read_only=True)
    assigned_security_name = serializers.CharField(source="assigned_security.username", read_only=True)
    assigned_security_full_name = serializers.SerializerMethodField()
    assigned_security_phone = serializers.CharField(source="assigned_security.phone", read_only=True)
    assigned_security_email = serializers.CharField(source="assigned_security.email", read_only=True)
    assigned_security_address = serializers.CharField(source="assigned_security.address", read_only=True)
    assigned_volunteer_name = serializers.CharField(source="assigned_volunteer.username", read_only=True)
    assigned_volunteer_full_name = serializers.SerializerMethodField()
    assigned_volunteer_phone = serializers.CharField(source="assigned_volunteer.phone", read_only=True)
    assigned_volunteer_email = serializers.CharField(source="assigned_volunteer.email", read_only=True)
    assigned_volunteer_address = serializers.CharField(source="assigned_volunteer.address", read_only=True)
    user_society = serializers.IntegerField(source="user.society_id", read_only=True)
    society_name = serializers.CharField(source="user.society.name", read_only=True)
    user_block_name = serializers.CharField(source="user.block.name", read_only=True)
    user_flat_number = serializers.CharField(source="user.flat.flat_number", read_only=True)
    user_floor = serializers.IntegerField(source="user.flat.floor", read_only=True)

    class Meta:
        model = Emergency
        fields = "__all__"
        read_only_fields = [
            "user", "status", "created_at", "reached_at", "assistance_started_at", "resolved_at", "accepted_at",
            "assigned_security", "assigned_volunteer", "additional_responders", "audit_logs", "escalations",
        ]

    def get_requester_name(self, obj):
        return obj.user.get_full_name() or obj.user.username

    def get_assigned_security_full_name(self, obj):
        if not obj.assigned_security:
            return None
        return obj.assigned_security.get_full_name() or obj.assigned_security.username

    def get_assigned_volunteer_full_name(self, obj):
        if not obj.assigned_volunteer:
            return None
        return obj.assigned_volunteer.get_full_name() or obj.assigned_volunteer.username


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = "__all__"
        read_only_fields = ["user", "created_at", "delivered_at", "read_at"]


class ResponderLocationSerializer(serializers.ModelSerializer):
    responder_username = serializers.CharField(source="responder.username", read_only=True)
    class Meta:
        model = ResponderLocation
        fields = "__all__"
        read_only_fields = ["responder", "updated_at"]


class ChatMessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.CharField(source="sender.username", read_only=True)
    sender_name = serializers.SerializerMethodField()

    class Meta:
        model = ChatMessage
        fields = ["id", "emergency", "sender", "sender_username", "sender_name", "message", "created_at"]
        read_only_fields = ["sender", "created_at", "sender_username", "sender_name"]

    def get_sender_name(self, obj):
        return obj.sender.get_full_name() if obj.sender else "System"
