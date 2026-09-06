"""
Providers models for AI VTuber system.
"""

from django.db import models
import uuid


class LLMProvider(models.Model):
    """LLM provider configuration."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, default="Free LLM API")
    api_url = models.URLField(default="http://192.168.1.10:31415/v1/chat/completions")
    api_key = models.CharField(max_length=255, blank=True)
    model_name = models.CharField(max_length=100, default="auto")
    temperature = models.FloatField(default=0.7)
    max_tokens = models.IntegerField(default=2048)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'core_llmprovider'
        verbose_name = "LLM Provider"
        verbose_name_plural = "LLM Providers"
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.model_name})"
