"""
Messages models for AI VTuber system.
"""

import uuid
from django.db import models

from core.models import Character


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
    user_name = models.CharField(
        max_length=100,
        blank=True,
        default='',
        help_text='Name of the user who sent this message (for per-user memory)'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'core_chatmessage'
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['character', 'user_name', 'created_at']),
        ]

    def __str__(self):
        return f"{self.character.name} - {self.role}: {self.content[:50]}"


class YouTubeLiveChatSession(models.Model):
    """Tracks a YouTube live chat connection session."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        PAUSED = "paused", "Paused"
        STOPPED = "stopped", "Stopped"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    video_id = models.CharField(max_length=20)
    character = models.ForeignKey(
        Character, on_delete=models.SET_NULL, null=True, related_name="yt_sessions"
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.ACTIVE
    )
    auto_reply = models.BooleanField(default=False)
    messages_received = models.IntegerField(default=0)
    replies_sent = models.IntegerField(default=0)
    started_at = models.DateTimeField(auto_now_add=True)
    stopped_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'core_youtubelivechatsession'
        ordering = ["-started_at"]

    def __str__(self):
        return f"{self.video_id} - {self.character} ({self.status})"


class YouTubeChatMessage(models.Model):
    """Stored YouTube chat messages for a session."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        YouTubeLiveChatSession, on_delete=models.CASCADE, related_name="messages"
    )
    author_name = models.CharField(max_length=200)
    author_channel_id = models.CharField(max_length=100, blank=True)
    text = models.TextField()
    is_mod = models.BooleanField(default=False)
    is_owner = models.BooleanField(default=False)
    is_super_chat = models.BooleanField(default=False)
    # If auto_reply is on, store the AI response
    ai_response = models.TextField(blank=True)
    ai_responded = models.BooleanField(default=False)
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'core_youtubechatmessage'
        ordering = ["-received_at"]

    def __str__(self):
        return f"{self.author_name}: {self.text[:50]}"
