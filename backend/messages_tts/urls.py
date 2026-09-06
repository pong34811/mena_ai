"""
URL configuration for messages_tts app.
"""

from django.urls import path

from . import views

urlpatterns = [
    # TTS settings endpoints
    path('tts/settings/', views.tts_settings_get, name='tts-settings'),
    path('tts/settings/update/', views.tts_settings_update, name='tts-settings-update'),
]
