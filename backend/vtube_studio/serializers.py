"""
Serializers for VTube Studio settings.
"""
from rest_framework import serializers
from .models import VTubeStudioSettings


class VTubeStudioSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = VTubeStudioSettings
        fields = ['id', 'api_url', 'port', 'is_connected', 'updated_at']
        read_only_fields = ['id', 'is_connected', 'updated_at']
