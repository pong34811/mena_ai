"""
API views for providers.
"""

from rest_framework import viewsets

from .models import LLMProvider
from .serializers import LLMProviderSerializer


class LLMProviderViewSet(viewsets.ModelViewSet):
    queryset = LLMProvider.objects.all()
    serializer_class = LLMProviderSerializer
