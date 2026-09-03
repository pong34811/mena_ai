"""
Models for YouTube Live Chat integration.
"""

import uuid
from django.db import models

from .models import Character


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
        ordering = ["-received_at"]

    def __str__(self):
        return f"{self.author_name}: {self.text[:50]}"
