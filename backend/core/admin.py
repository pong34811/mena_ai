"""
Custom admin configuration for AI VTuber system.
"""

from django.contrib import admin
from .models import Character, ChatMessage, LLMProvider
from .youtube_admin import *  # Registers YouTube models


class CharacterAdmin(admin.ModelAdmin):
    """Admin for AI VTuber characters."""
    
    list_display = ['name', 'description', 'is_active', 'created_at', 'updated_at']
    list_filter = ['is_active', 'created_at']
    search_fields = ['name', 'description', 'system_prompt']
    readonly_fields = ['id', 'created_at', 'updated_at']
    
    fieldsets = (
        ('Basic Info', {
            'fields': ('name', 'description', 'avatar_url', 'is_active')
        }),
        ('AI Configuration', {
            'fields': ('system_prompt', 'system_prompt_ai'),
            'description': 'System prompt defines the character personality and behavior'
        }),
        ('Metadata', {
            'fields': ('id', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


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


class LLMProviderAdmin(admin.ModelAdmin):
    """Admin for LLM provider configurations."""
    
    list_display = ['name', 'model_name', 'api_url', 'temperature', 'max_tokens', 'is_active', 'updated_at']
    list_filter = ['is_active', 'model_name', 'created_at']
    search_fields = ['name', 'api_url', 'model_name']
    readonly_fields = ['id', 'created_at', 'updated_at']
    
    fieldsets = (
        ('Basic Info', {
            'fields': ('name', 'is_active')
        }),
        ('API Configuration', {
            'fields': ('api_url', 'api_key', 'model_name'),
            'description': 'Configure the LLM API endpoint and credentials'
        }),
        ('Model Parameters', {
            'fields': ('temperature', 'max_tokens'),
            'description': 'Control response creativity and length'
        }),
        ('Metadata', {
            'fields': ('id', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    actions = ['activate_providers', 'deactivate_providers']
    
    def activate_providers(self, request, queryset):
        """Bulk activate selected providers."""
        count = queryset.update(is_active=True)
        self.message_user(request, f'{count} provider(s) activated')
    activate_providers.short_description = "Activate selected providers"
    
    def deactivate_providers(self, request, queryset):
        """Bulk deactivate selected providers."""
        count = queryset.update(is_active=False)
        self.message_user(request, f'{count} provider(s) deactivated')
    deactivate_providers.short_description = "Deactivate selected providers"


# Register admin classes
admin.site.register(Character, CharacterAdmin)
admin.site.register(ChatMessage, ChatMessageAdmin)
admin.site.register(LLMProvider, LLMProviderAdmin)
