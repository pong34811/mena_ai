"""
Admin registration for messages models.
"""

from django.contrib import admin

from .models import ChatMessage, YouTubeLiveChatSession, YouTubeChatMessage


class ChatMessageAdmin(admin.ModelAdmin):
    """Admin for chat message history."""

    list_display = ['character', 'role', 'user_name', 'content_preview', 'created_at']
    list_filter = ['role', 'created_at', 'character']
    search_fields = ['content', 'user_name']
    readonly_fields = ['id', 'created_at']
    date_hierarchy = 'created_at'
    list_select_related = ['character']
    autocomplete_fields = ['character']
    list_per_page = 50

    def content_preview(self, obj):
        """Show preview of message content."""
        return obj.content[:100] + '...' if len(obj.content) > 100 else obj.content
    content_preview.short_description = 'Content'


@admin.register(YouTubeLiveChatSession)
class YouTubeLiveChatSessionAdmin(admin.ModelAdmin):
    list_display = ("video_id", "character", "status", "messages_received",
                    "replies_sent", "started_at", "stopped_at")
    list_filter = ("status", "auto_reply")
    search_fields = ("video_id",)
    readonly_fields = ("started_at",)
    date_hierarchy = "started_at"
    list_select_related = ("character",)
    autocomplete_fields = ("character",)
    list_per_page = 50


@admin.register(YouTubeChatMessage)
class YouTubeChatMessageAdmin(admin.ModelAdmin):
    list_display = ("author_name", "text_preview", "is_super_chat", "ai_responded", "received_at")
    list_filter = ("is_super_chat", "is_mod", "is_owner", "ai_responded")
    search_fields = ("author_name", "text")
    readonly_fields = ("received_at",)
    date_hierarchy = "received_at"
    list_select_related = ("session",)
    autocomplete_fields = ("session",)
    list_per_page = 50

    def text_preview(self, obj):
        """Show a short preview of the message text."""
        return obj.text[:80] + '...' if len(obj.text) > 80 else obj.text
    text_preview.short_description = 'Text'


admin.site.register(ChatMessage, ChatMessageAdmin)
