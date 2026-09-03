"""
Admin registration for YouTube chat models.
"""

from django.contrib import admin

from .youtube_models import YouTubeLiveChatSession, YouTubeChatMessage


@admin.register(YouTubeLiveChatSession)
class YouTubeLiveChatSessionAdmin(admin.ModelAdmin):
    list_display = ("video_id", "character", "status", "messages_received", "started_at")
    list_filter = ("status",)
    search_fields = ("video_id",)


@admin.register(YouTubeChatMessage)
class YouTubeChatMessageAdmin(admin.ModelAdmin):
    list_display = ("author_name", "text", "is_super_chat", "ai_responded", "received_at")
    list_filter = ("is_super_chat", "is_mod", "is_owner", "ai_responded")
    search_fields = ("author_name", "text")
