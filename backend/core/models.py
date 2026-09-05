"""
Core models for AI VTuber system.
"""

from django.db import models
import re
import uuid


# Maps response_language codes to display names + unicode scripts used for
# server-side reply enforcement (see Character.matches_language).
LANGUAGE_NAMES = {
    'thai': 'ไทย',
    'english': 'อังกฤษ',
    'japanese': 'ญี่ปุ่น',
    'chinese': 'จีน',
    'korean': 'เกาหลี',
}

LANGUAGE_SCRIPTS = {
    'thai': r'[\u0e00-\u0e7f]',
    'english': r'[A-Za-z]',
    'japanese': r'[\u3040-\u30ff\u4e00-\u9fff]',
    'chinese': r'[\u4e00-\u9fff]',
    'korean': r'[\uac00-\ud7af\u1100-\u11ff]',
}

# Hard server-side reply budgets per response_length: (max_sentences, max_chars).
# 'short' must stay 1-2 sentences even when the model ignores the prompt or the
# token-budget retry returns a longer completion. None = no truncation.
RESPONSE_LIMITS = {
    'short': {'sentences': 2, 'chars': 160},
    'normal': {'sentences': 4, 'chars': 400},
    'long': None,
    'custom': None,
}

# Split points between sentences/lines for truncation (Thai-friendly: Thai
# rarely uses periods, so newlines and ?!…。、count as boundaries too).
_SEGMENT_SPLIT_RE = re.compile(r'\n+|[.!?…。！？]+["\'」』)\]]*\s*')

_LETTER_RE = re.compile(r'[^\W\d_]', re.UNICODE)


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
    avatar_border_color = models.CharField(
        max_length=7,
        blank=True,
        default='#ffffff',
        help_text='Hex color code for avatar border (e.g., #ff6600)'
    )
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

    def get_language_name(self) -> str:
        """Display name of the configured response language (e.g. 'ไทย')."""
        language = self.response_language or 'thai'
        return LANGUAGE_NAMES.get(language, language)

    def build_system_prompt(self) -> str:
        """Build the system prompt with templates replaced."""
        language_name = self.get_language_name()
        prompt = self.system_prompt
        if self.system_prompt_ai:
            prompt += f"\n\n{self.system_prompt_ai}"

        name_th = self.name_th or self.name
        name_en = self.name_en or self.name
        prompt = prompt.replace('{name_th}', name_th).replace('{name_en}', name_en)

        length_map = {
            'short': 'ตอบสั้นๆ ไม่เกิน 1-2 ประโยค หรือ 60 ตัวอักษร เหมือนสตรีมเมอร์ทั่วไป',
            'normal': 'ตอบปกติ ไม่เกิน 2-4 ประโยค หรือ 150 ตัวอักษร',
            'long': 'ตอบยาวเต็มที่ ให้รายละเอียด',
            'custom': f'ตอบตามความยาวที่กำหนด (max_tokens={self.custom_max_tokens or 1024})',
        }
        length_text = length_map.get(self.response_length, length_map['short'])
        prompt = prompt.replace('{response_length_instruction}', length_text)

        prompt += (
            f"\n\n**สำคัญมาก: คุณต้องตอบกลับเป็นภาษา{language_name}เท่านั้น "
            f"แม้ผู้ใช้พิมพ์มาเป็นภาษาอื่นก็ต้องตอบเป็นภาษา{language_name} ห้ามตอบเป็นภาษาอื่น**"
            f"\n**ตอบแบบสตรีมเมอร์คุยกับคนดูอย่างเป็นกันเองเท่านั้น ห้ามวิเคราะห์หรืออธิบายข้อความของผู้ใช้ "
            f"ห้ามใช้เครื่องหมาย markdown เช่น ** หรือ ## หรือหัวข้อวิเคราะห์**"
        )
        return prompt

    def get_max_tokens(self) -> int:
        """Get max_tokens based on response_length setting."""
        length_tokens = {'short': 128, 'normal': 256, 'long': 512, 'custom': self.custom_max_tokens or 512}
        return length_tokens.get(self.response_length, 256)

    def get_response_limit(self) -> dict | None:
        """Hard reply budget for this character's response_length (None = no cap)."""
        return RESPONSE_LIMITS.get(self.response_length or 'short')

    def enforce_response_length(self, text: str) -> str:
        """Deterministically truncate a reply to the response_length budget.

        Keeps at most max_sentences segments (split on newlines / sentence
        punctuation) and max_chars characters. Long/custom pass through.
        """
        text = (text or '').strip()
        limit = self.get_response_limit()
        if not limit or not text:
            return text
        segments = [s.strip() for s in _SEGMENT_SPLIT_RE.split(text) if s.strip()]
        kept = ' '.join(segments[:limit['sentences']])
        max_chars = limit['chars']
        if len(kept) > max_chars:
            cut = kept[:max_chars].rstrip()
            # Avoid cutting mid-word when the text uses spaces.
            if ' ' in cut[-40:]:
                cut = cut[:cut.rfind(' ')].rstrip()
            kept = cut
        return kept.strip()

    def is_over_budget(self, text: str) -> bool:
        """True when a (partial) reply already exceeds the length budget.

        Used to stop a live stream early instead of sending tokens that would
        be truncated anyway.
        """
        limit = self.get_response_limit()
        if not limit or not text:
            return False
        segments = [s for s in _SEGMENT_SPLIT_RE.split(text) if s.strip()]
        if len(segments) > limit['sentences']:
            return True
        return len(text) > limit['chars'] + 20  # small slack for streaming

    def matches_language(self, text: str) -> bool:
        """True when a reply is written in the configured response_language.

        Requires at least half of the reply's letters to be in the target
        script, so quoted foreign words are tolerated but a fully foreign
        reply is rejected. Replies without any letters (emoji only) pass.
        """
        language = self.response_language or 'thai'
        script = LANGUAGE_SCRIPTS.get(language)
        if not script or not text:
            return True
        letters = _LETTER_RE.findall(text)
        if not letters:
            return True
        target = re.findall(script, text)
        return len(target) >= max(1, len(letters) / 2)


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