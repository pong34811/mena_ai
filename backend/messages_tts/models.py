"""
Messages & TTS models for AI VTuber system.
"""

from django.db import models
import uuid


class TTSSettings(models.Model):
    """System-wide TTS configuration (singleton — only one row exists)."""

    SINGLETON_PK = 1

    # Questioner settings (YouTube chat sender)
    questioner_enabled = models.BooleanField(
        default=True,
        help_text="เล่นเสียง TTS สำหรับผู้ส่งแชท (ผู้ถาม)"
    )
    questioner_voice = models.CharField(
        max_length=100,
        default='th-TH-PremwadeeNeural',
        help_text="เสียง TTS สำหรับผู้ถาม"
    )
    questioner_rate = models.CharField(
        max_length=10,
        default='+0%',
        help_text="ความเร็วเสียงผู้ถาม (เช่น +10%, -10%)"
    )
    questioner_say_username = models.BooleanField(
        default=True,
        help_text="พูดชื่อผู้ใช้ก่อนข้อความ (เช่น username... รอ 1 วินาที... ข้อความ)"
    )

    # Responder settings (AI Character)
    responder_enabled = models.BooleanField(
        default=True,
        help_text="เล่นเสียง TTS สำหรับผู้ตอบ (Character)"
    )
    responder_voice = models.CharField(
        max_length=100,
        default='th-TH-PremwadeeNeural',
        help_text="เสียง TTS สำหรับผู้ตอบ"
    )
    responder_rate = models.CharField(
        max_length=10,
        default='+0%',
        help_text="ความเร็วเสียงผู้ตอบ"
    )

    # Queue behavior
    responder_delay_ms = models.IntegerField(
        default=1000,
        help_text="เวลารอระหว่างชื่อผู้ใช้กับข้อความ (มิลลิวินาที)"
    )

    # Output routing — where TTS audio plays (browser-side via Web Audio API)
    # DEPRECATED: device selection now lives in the output_devices app
    # (OutputDeviceSelection is the source of truth). Field kept so the running
    # frontend can PATCH it until it fully migrates to the new endpoints.
    output_device_id = models.CharField(
        max_length=255,
        default='',
        blank=True,
        help_text="Web Audio device ID สำหรับเล่น TTS (เช่น 'default', 'communications', หรือ device ID จาก enumerateDevices). ว่างไว้ = browser default speaker.",
    )

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'core_ttssettings'
        verbose_name = "TTS Settings"
        verbose_name_plural = "TTS Settings"

    def save(self, *args, **kwargs):
        self.pk = self.SINGLETON_PK
        super().save(*args, **kwargs)

    @classmethod
    def get_instance(cls) -> "TTSSettings":
        obj, _ = cls.objects.get_or_create(pk=cls.SINGLETON_PK)
        return obj

    def __str__(self):
        return "TTS Settings"
