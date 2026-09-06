"""
URL configuration for core app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from . import views
from . import tts_views

router = DefaultRouter()
router.register(r'characters', views.CharacterViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('chat/', views.chat, name='chat'),
    path('health/', views.health_check, name='health-check'),
    path('llm-status/', views.llm_status, name='llm-status'),
    path('characters/<str:character_id>/generate-prompt/', views.generate_character_prompt, name='generate-character-prompt'),
    # TTS generation endpoints (still in core)
    path('tts/generate/', tts_views.tts_generate, name='tts-generate'),
    path('tts/voices/', tts_views.tts_voices, name='tts-voices'),
    path('tts/chat-message/', tts_views.tts_chat_message, name='tts-chat-message'),
]
