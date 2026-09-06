"""
Custom admin configuration for AI VTuber system.
"""

from django.contrib import admin
from .models import Character


class CharacterAdmin(admin.ModelAdmin):
    """Admin for AI VTuber characters."""
    
    list_display = ['name', 'name_th', 'name_en', 'description', 'is_active', 'created_at', 'updated_at']
    list_filter = ['is_active', 'created_at']
    search_fields = ['name', 'name_th', 'name_en', 'description', 'system_prompt']
    readonly_fields = ['id', 'created_at', 'updated_at']
    
    fieldsets = (
        ('Basic Info', {
            'fields': ('name', 'name_th', 'name_en', 'description', 'avatar_url', 'is_active')
        }),
        ('AI Configuration', {
            'fields': ('system_prompt', 'system_prompt_ai', 'response_length'),
            'description': 'System prompt defines the character personality and behavior'
        }),
        ('Metadata', {
            'fields': ('id', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


# Register admin classes
admin.site.register(Character, CharacterAdmin)
