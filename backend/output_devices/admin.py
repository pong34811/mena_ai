"""
Admin registration for output_devices models.
"""

from django.contrib import admin

from .models import OutputDevice, OutputDeviceSelection


@admin.register(OutputDevice)
class OutputDeviceAdmin(admin.ModelAdmin):
    list_display = ['name', 'device_id', 'platform', 'is_active', 'updated_at']
    search_fields = ['name', 'device_id']
    list_filter = ['platform', 'is_active']


@admin.register(OutputDeviceSelection)
class OutputDeviceSelectionAdmin(admin.ModelAdmin):
    list_display = ['device', 'device_id_legacy', 'source', 'selected_at']
    readonly_fields = ['device', 'device_id_legacy', 'source', 'selected_at']

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False