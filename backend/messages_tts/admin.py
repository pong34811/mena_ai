"""
Admin registration for messages_tts models.
"""

from django.contrib import admin

from .models import TTSSettings


admin.site.register(TTSSettings)
