"""
Core models for AI VTuber system.
"""

from django.db import models
import uuid


class Character(models.Model):
    """AI VTuber character configuration."""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    name_th = models.CharField(max_length=100, blank=True, help_text='ชื่อภาษาไทย (เช่น มีนา)')
    name_en = models.CharField(max_length=100, blank=True, help_text='ชื่อภาษาอังกฤษ (เช่น Mena)')
    description = models.TextField(blank=True)
    system_prompt = models.TextField(
        default="You are a friendly AI VTuber. Respond in a casual, engaging manner."
    )
    system_prompt_ai = models.TextField(
        blank=True,
        max_length=8000,
        help_text='AI-generated prompt based on chat history (max 8000 chars) — combined with system prompt during chat'
    )
    avatar_url = models.URLField(blank=True)
    response_language = models.CharField(
        max_length=20,
        default='thai',
        help_text='Language the character should always respond in (e.g., thai, english, japanese)'
    )
    enable_per_user_memory = models.BooleanField(
        default=True,
        help_text='Enable per-user memory (remember individual users by name)'
    )
    memory_duration_days = models.IntegerField(
        default=3,
        help_text='How long to remember user messages (days)'
    )
    is_active = models.BooleanField(default=True)
    response_length = models.CharField(
        max_length=10,
        default='short',
        choices=[
            ('short', 'สั้น (Short)'),
            ('normal', 'ปกติ (Normal)'),
            ('long', 'ยาว (Long)'),
            ('custom', 'Custom'),
        ],
        help_text='ความยาวคำตอบ: สั้น=1-2 ประโยค, ปกติ=2-3 ประโยค, ยาว=เต็มที่, custom=ตั้งค่าเอง'
    )
    custom_max_tokens = models.IntegerField(
        null=True,
        blank=True,
        help_text='Custom max_tokens (ใช้เมื่อเลือก Custom)'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "characters"
        ordering = ['-created_at']

    def __str__(self):
        return self.name


class ChatMessage(models.Model):
    """Chat message history."""
    
    class Role(models.TextChoices):
        USER = 'user', 'User'
        ASSISTANT = 'assistant', 'Assistant'
        SYSTEM = 'system', 'System'
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    character = models.ForeignKey(
        Character, on_delete=models.CASCADE, related_name='messages'
    )
    role = models.CharField(max_length=20, choices=Role.choices)
    content = models.TextField()
    user_name = models.CharField(
        max_length=100,
        blank=True,
        default='',
        help_text='Name of the user who sent this message (for per-user memory)'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['character', 'user_name', 'created_at']),
        ]

    def __str__(self):
        return f"{self.character.name} - {self.role}: {self.content[:50]}"


class LLMProvider(models.Model):
    """LLM provider configuration."""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, default="Free LLM API")
    api_url = models.URLField(default="http://127.0.0.1:31415/v1/chat/completions")
    api_key = models.CharField(max_length=255, blank=True)
    model_name = models.CharField(max_length=100, default="auto")
    temperature = models.FloatField(default=0.7)
    max_tokens = models.IntegerField(default=2048)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "LLM Provider"
        verbose_name_plural = "LLM Providers"
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.model_name})"


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
        help_text="พูดชื่อผู้ใช้ก่อนข้อความ (เช่น username... รอ 3 วินาที... ข้อความ)"
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
        default=3000,
        help_text="เวลารอระหว่างชื่อผู้ใช้กับข้อความ (มิลลิวินาที)"
    )

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
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
