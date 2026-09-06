"""
Serializers for core models.
"""

from rest_framework import serializers
from .models import Character


class CharacterSerializer(serializers.ModelSerializer):
    system_prompt_ai = serializers.CharField(max_length=8000, required=False, allow_blank=True)
    
    class Meta:
        model = Character
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']


class ChatRequestSerializer(serializers.Serializer):
    """Serializer for chat request payload."""
    
    character_id = serializers.UUIDField(required=True)
    message = serializers.CharField(required=True)
    user_name = serializers.CharField(required=False, default='', max_length=100)
    stream = serializers.BooleanField(default=False)
