"""
Serializers for core models.
"""

from rest_framework import serializers
from .models import Character, ChatMessage, LLMProvider


class CharacterSerializer(serializers.ModelSerializer):
    class Meta:
        model = Character
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']


class ChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        fields = '__all__'
        read_only_fields = ['id', 'created_at']


class ChatRequestSerializer(serializers.Serializer):
    """Serializer for chat request payload."""
    
    character_id = serializers.UUIDField(required=True)
    message = serializers.CharField(required=True)
    stream = serializers.BooleanField(default=False)


class ChatResponseSerializer(serializers.Serializer):
    """Serializer for chat response."""
    
    response = serializers.CharField()
    character_id = serializers.UUIDField()
    message_id = serializers.UUIDField()


class LLMProviderSerializer(serializers.ModelSerializer):
    class Meta:
        model = LLMProvider
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']
