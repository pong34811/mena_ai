"""
Core models for AI VTuber system.
"""

from django.db import models
import uuid


class Character(models.Model):
    """AI VTuber character configuration."""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    system_prompt = models.TextField(
        default="You are a friendly AI VTuber. Respond in a casual, engaging manner."
    )
    avatar_url = models.URLField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "characters"
        ordering = ['-created_at']

    def __str__(self):
        return self.name


class ChatMessage(models.Model):
    """Chat message history."""
    
    class Role(models.TextChoices):
        USER = 'user', 'User'
        ASSISTANT = 'assistant', 'Assistant'
        SYSTEM = 'system', 'System'
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    character = models.ForeignKey(
        Character, on_delete=models.CASCADE, related_name='messages'
    )
    role = models.CharField(max_length=20, choices=Role.choices)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"{self.character.name} - {self.role}: {self.content[:50]}"


class LLMProvider(models.Model):
    """LLM provider configuration."""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, default="Free LLM API")
    api_url = models.URLField(default="http://127.0.0.1:31415/v1/chat/completions")
    api_key = models.CharField(max_length=255, blank=True)
    model_name = models.CharField(max_length=100, default="auto")
    temperature = models.FloatField(default=0.7)
    max_tokens = models.IntegerField(default=2048)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "LLM Provider"
        verbose_name_plural = "LLM Providers"
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.model_name})"
