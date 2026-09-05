"""
URL configuration for vtube_studio app.
"""
from django.urls import path
from . import views

urlpatterns = [
    path('vtube/settings/', views.vtube_settings_get, name='vtube-settings'),
    path('vtube/settings/update/', views.vtube_settings_update, name='vtube-settings-update'),
    path('vtube/test-connection/', views.vtube_test_connection, name='vtube-test-connection'),
]
