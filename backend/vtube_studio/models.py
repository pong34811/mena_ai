"""
VTube Studio API connection settings (singleton).
"""
from django.db import models


class VTubeStudioSettings(models.Model):
    """System-wide VTube Studio API connection configuration (singleton)."""

    SINGLETON_PK = 1

    api_url = models.CharField(
        max_length=255,
        default='ws://127.0.0.1:9000',
        help_text='WebSocket URL สำหรับเชื่อมต่อ VTube Studio API (เช่น ws://127.0.0.1:9000)'
    )
    port = models.IntegerField(
        default=9000,
        help_text='Port สำหรับ VTube Studio API'
    )
    is_connected = models.BooleanField(
        default=False,
        help_text='สถานะการเชื่อมต่อ (อัปเดตอัตโนมัติเมื่อทดสอบการเชื่อมต่อ)'
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'VTube Studio Settings'
        verbose_name_plural = 'VTube Studio Settings'

    def save(self, *args, **kwargs):
        self.pk = self.SINGLETON_PK
        super().save(*args, **kwargs)

    @classmethod
    def get_instance(cls) -> 'VTubeStudioSettings':
        obj, _ = cls.objects.get_or_create(pk=cls.SINGLETON_PK)
        return obj

    def __str__(self):
        return f'VTube Studio ({self.api_url})'
