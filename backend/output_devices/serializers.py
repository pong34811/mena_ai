"""
Serializers for output_devices models.
"""

from rest_framework import serializers

from .models import OutputDevice, OutputDeviceSelection


class OutputDeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = OutputDevice
        fields = [
            'id', 'name', 'device_id', 'platform',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class OutputDeviceSelectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = OutputDeviceSelection
        fields = ['id', 'device', 'device_id_legacy', 'selected_at', 'source']
        read_only_fields = fields