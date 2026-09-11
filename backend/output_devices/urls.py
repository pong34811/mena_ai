"""
URL configuration for output_devices app.
"""

from django.urls import path

from . import views

urlpatterns = [
    path('output-devices/', views.output_devices_list, name='output-devices-list'),
    path('output-devices/capture/', views.output_device_capture, name='output-device-capture'),
    path('output-devices/current/', views.output_device_current, name='output-device-current'),
]