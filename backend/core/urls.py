"""
URL configuration for core app.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r'characters', views.CharacterViewSet)
router.register(r'llm-providers', views.LLMProviderViewSet)
router.register(r'messages', views.ChatMessageViewSet, basename='messages')

urlpatterns = [
    path('', include(router.urls)),
    path('chat/', views.chat, name='chat'),
    path('health/', views.health_check, name='health-check'),
    path('llm-status/', views.llm_status, name='llm-status'),
]
