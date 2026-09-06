"""
Admin registration for providers models.
"""

from django.contrib import admin

from .models import LLMProvider


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


admin.site.register(LLMProvider, LLMProviderAdmin)
