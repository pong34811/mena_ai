"""
Models for output_devices: a catalog of known output (audio) devices plus an
append-only history of which device was last selected.
"""

from django.db import models


class OutputDevice(models.Model):
    """Catalog of known output (audio) devices captured from the browser."""

    PLATFORM_CHOICES = (
        ('windows', 'Windows'),
        ('macos', 'macOS'),
        ('linux', 'Linux'),
        ('other', 'Other'),
    )

    name = models.CharField(
        max_length=255,
        help_text="label สำหรับแสดงผล (default = browser label)",
    )
    device_id = models.CharField(
        max_length=255,
        help_text="deviceId จาก enumerateDevices()",
    )
    platform = models.CharField(
        max_length=32,
        choices=PLATFORM_CHOICES,
        default='other',
    )
    is_active = models.BooleanField(
        default=True,
        help_text="เปิด/ปิดการใช้งานใน dropdown",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-is_active', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['platform', 'device_id'],
                name='uniq_output_device_platform_device',
            ),
        ]
        verbose_name = 'Output Device'
        verbose_name_plural = 'Output Devices'

    def __str__(self):
        return self.name or self.device_id


class OutputDeviceSelection(models.Model):
    """Append-only history of selections; the latest row is the current device."""

    device = models.ForeignKey(
        OutputDevice,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='selections',
    )
    device_id_legacy = models.CharField(
        max_length=255,
        blank=True,
        default='',
        help_text="snapshot ของ device ID (กันกรณี device ถูกลบ)",
    )
    selected_at = models.DateTimeField(auto_now_add=True)
    source = models.CharField(
        max_length=32,
        default='auto_capture',
        help_text="ที่มาของการเลือก เช่น auto_capture",
    )

    class Meta:
        ordering = ['-selected_at', '-id']
        verbose_name = 'Output Device Selection'
        verbose_name_plural = 'Output Device Selections'

    def __str__(self):
        label = self.device.name if self.device else self.device_id_legacy or '?'
        return f"{label} @ {self.selected_at}"