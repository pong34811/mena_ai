"""
Admin registration for messages_tts models.

TTSSettings is a singleton (one row, pk=1) — the admin exposes it as a
single change page and blocks add/delete so nobody can break the pattern.
"""

from django.contrib import admin
from django.shortcuts import redirect

from .models import TTSSettings


@admin.register(TTSSettings)
class TTSSettingsAdmin(admin.ModelAdmin):
    list_display = [
        'questioner_enabled', 'questioner_voice', 'questioner_rate',
        'responder_enabled', 'responder_voice', 'responder_rate',
        'responder_delay_ms', 'updated_at',
    ]
    readonly_fields = ['updated_at']

    fieldsets = (
        ('Questioner (ผู้ถาม)', {
            'fields': ('questioner_enabled', 'questioner_voice',
                       'questioner_rate', 'questioner_say_username'),
        }),
        ('Responder (ผู้ตอบ / AI)', {
            'fields': ('responder_enabled', 'responder_voice', 'responder_rate'),
        }),
        ('Queue Behavior', {
            'fields': ('responder_delay_ms', 'updated_at'),
        }),
    )

    def has_add_permission(self, request):
        # Singleton: redirect to the existing row instead of adding a new one.
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        # Go straight to the singleton's change form.
        obj = TTSSettings.get_instance()
        return redirect(
            'admin:{}_{}_change'.format(
                obj._meta.app_label, obj._meta.model_name
            ),
            obj.pk,
        )
