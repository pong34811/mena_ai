"""
Admin registration for messages models.
"""

from django.contrib import admin

from .models import ChatMessage, YouTubeLiveChatSession, YouTubeChatMessage


class ChatMessageAdmin(admin.ModelAdmin):
    """Admin for chat message history."""

    list_display = ['character', 'role', 'content_preview', 'created_at']
    list_filter = ['role', 'created_at', 'character']
    search_fields = ['content']
    readonly_fields = ['id', 'created_at']

    def content_preview(self, obj):
        """Show preview of message content."""
        return obj.content[:100] + '...' if len(obj.content) > 100 else obj.content
    content_preview.short_description = 'Content'


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


admin.site.register(ChatMessage, ChatMessageAdmin)
