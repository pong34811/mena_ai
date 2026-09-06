"""
URL configuration for vtube_studio app.
"""
from django.urls import path
from . import views

urlpatterns = [
    # Connection settings
    path('vtube/settings/', views.vtube_settings_get, name='vtube-settings'),
    path('vtube/settings/update/', views.vtube_settings_update, name='vtube-settings-update'),
    path('vtube/test-connection/', views.vtube_test_connection, name='vtube-test-connection'),

    # Mouth control
    path('vtube/mouth/start/', views.vtube_mouth_start, name='vtube-mouth-start'),
    path('vtube/mouth/stop/', views.vtube_mouth_stop, name='vtube-mouth-stop'),
    path('vtube/mouth/status/', views.vtube_mouth_status, name='vtube-mouth-status'),
    path('vtube/mouth/test/', views.vtube_mouth_test, name='vtube-mouth-test'),
]
