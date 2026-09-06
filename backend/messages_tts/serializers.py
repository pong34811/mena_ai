"""
Serializers for messages_tts models.
"""

from rest_framework import serializers
from .models import TTSSettings


class TTSSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = TTSSettings
        fields = '__all__'
        read_only_fields = ['updated_at']
