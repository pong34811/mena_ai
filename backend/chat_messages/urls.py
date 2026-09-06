"""
URL configuration for messages app.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r'messages', views.ChatMessageViewSet, basename='messages')
router.register(r'yt-sessions', views.YouTubeLiveChatSessionViewSet, basename='yt-sessions')
router.register(r'yt-messages', views.YouTubeChatMessageViewSet, basename='yt-messages')

urlpatterns = [
    path('', include(router.urls)),
    path('yt-chat/start/', views.start_youtube_chat, name='yt-chat-start'),
    path('yt-chat/stop/', views.stop_youtube_chat, name='yt-chat-stop'),
    path('yt-chat/status/', views.youtube_chat_status, name='yt-chat-status'),
]
