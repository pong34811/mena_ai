"""
Routing for core app WebSocket consumers.
"""
from django.urls import path

from . import consumers

websocket_urlpatterns = [
    path('ws/chat/', consumers.ChatStreamConsumer.as_asgi()),
]