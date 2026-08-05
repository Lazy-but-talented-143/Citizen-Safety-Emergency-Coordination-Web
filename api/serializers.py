from rest_framework import serializers
from accounts.models import User
from society.models import Society, Block, Flat


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "email",
            "password",
            "phone",
            "address",
            "role",
            "society",
            "block",
            "flat",
            "volunteer_status"
        ]

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

class SocietySerializer(serializers.ModelSerializer):
    class Meta:
        model = Society
        fields = "__all__"

class BlockSerializer(serializers.ModelSerializer):
    class Meta:
        model = Block
        fields = "__all__"


class FlatSerializer(serializers.ModelSerializer):
    class Meta:
        model = Flat
        fields = "__all__"
        
from accounts.models import Guardian


class GuardianSerializer(serializers.ModelSerializer):
    class Meta:
        model = Guardian
        fields = "__all__"
from emergency.models import Emergency


class EmergencySerializer(serializers.ModelSerializer):
    class Meta:
        model = Emergency
        fields = "__all__"
        read_only_fields = [
            "user",
            "status",
            "created_at",
            "assistance_started_at",
            "resolved_at",
            "assigned_security",
            "assigned_volunteer",
        ]

from emergency.models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = "__all__"