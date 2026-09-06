"""
Serializers for messages models.
"""

from rest_framework import serializers
from .models import ChatMessage, YouTubeChatMessage, YouTubeLiveChatSession


class ChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        fields = '__all__'
        read_only_fields = ['id', 'created_at']


class YouTubeChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = YouTubeChatMessage
        fields = "__all__"
        read_only_fields = ["id", "received_at"]


class YouTubeLiveChatSessionSerializer(serializers.ModelSerializer):
    messages = YouTubeChatMessageSerializer(many=True, read_only=True)
    character_name = serializers.CharField(source="character.name", read_only=True)

    class Meta:
        model = YouTubeLiveChatSession
        fields = "__all__"
        read_only_fields = ["id", "started_at", "stopped_at"]


class YouTubeChatStartSerializer(serializers.Serializer):
    """Serializer for starting a YouTube live chat session."""

    video_id = serializers.CharField(required=True, max_length=20)
    character_id = serializers.UUIDField(required=False, allow_null=True)
    auto_reply = serializers.BooleanField(default=False)
