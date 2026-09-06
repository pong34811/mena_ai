"""
URL configuration for mena_ai project.
"""

from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include([
        path('', include('core.urls')),
        path('', include('providers.urls')),
        path('', include('chat_messages.urls')),
        path('', include('messages_tts.urls')),
        path('', include('vtube_studio.urls')),
    ])),
]
