"""
Serializers for providers models.
"""

from rest_framework import serializers
from .models import LLMProvider


class LLMProviderSerializer(serializers.ModelSerializer):
    class Meta:
        model = LLMProvider
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']
