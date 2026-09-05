"""
Admin for VTube Studio settings.
"""
from django.contrib import admin
from .models import VTubeStudioSettings


@admin.register(VTubeStudioSettings)
class VTubeStudioSettingsAdmin(admin.ModelAdmin):
    list_display = ('api_url', 'port', 'is_connected', 'updated_at')
    readonly_fields = ('is_connected', 'updated_at')

    def has_add_permission(self, request):
        # Singleton — ไม่ต้องให้เพิ่มใหม่
        return False

    def has_delete_permission(self, request, obj=None):
        # Singleton — ไม่ต้องให้ลบ
        return False
