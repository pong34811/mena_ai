"""
URL configuration for core app.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter

from . import views
from . import youtube_views

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
]
