"""
URL configuration for core app.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter

from . import views
from . import youtube_views
from . import tts_views

router = DefaultRouter()
router.register(r'characters', views.CharacterViewSet)
router.register(r'llm-providers', views.LLMProviderViewSet)
router.register(r'messages', views.ChatMessageViewSet, basename='messages')
router.register(r'yt-sessions', youtube_views.YouTubeLiveChatSessionViewSet, basename='yt-sessions')
router.register(r'yt-messages', youtube_views.YouTubeChatMessageViewSet, basename='yt-messages')

urlpatterns = [
    path('', include(router.urls)),
    path('chat/', views.chat, name='chat'),
    path('health/', views.health_check, name='health-check'),
    path('llm-status/', views.llm_status, name='llm-status'),
    path('characters/<str:character_id>/generate-prompt/', views.generate_character_prompt, name='generate-character-prompt'),
    # YouTube live chat endpoints
    path('yt-chat/start/', youtube_views.start_youtube_chat, name='yt-chat-start'),
    path('yt-chat/stop/', youtube_views.stop_youtube_chat, name='yt-chat-stop'),
    path('yt-chat/status/', youtube_views.youtube_chat_status, name='yt-chat-status'),
    # TTS endpoints
    path('tts/generate/', tts_views.tts_generate, name='tts-generate'),
    path('tts/voices/', tts_views.tts_voices, name='tts-voices'),
    path('tts/chat-message/', tts_views.tts_chat_message, name='tts-chat-message'),
    # TTS settings endpoints
    path('tts/settings/', tts_views.tts_settings_get, name='tts-settings'),
    path('tts/settings/update/', tts_views.tts_settings_update, name='tts-settings-update'),
]
