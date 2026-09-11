"""
API views for output_devices.
"""

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from .models import OutputDevice, OutputDeviceSelection
from .serializers import OutputDeviceSerializer

_ACCEPTED_PLATFORMS = ('windows', 'macos', 'linux', 'other')


def _normalize_platform(raw):
    value = str(raw or '').strip().lower()
    return value if value in _ACCEPTED_PLATFORMS else 'other'


@api_view(['GET'])
def output_devices_list(request: Request) -> Response:
    """List all catalogued output devices (active first)."""
    devices = OutputDevice.objects.all()
    return Response(OutputDeviceSerializer(devices, many=True).data)


@api_view(['POST'])
def output_device_capture(request: Request) -> Response:
    """Upsert a device from an enumerateDevices() snapshot + record selection."""
    device_id = str(request.data.get('device_id', '')).strip()
    label = str(request.data.get('label', '')).strip()
    platform = _normalize_platform(request.data.get('platform'))

    if not device_id or not label:
        return Response(
            {'error': 'device_id และ label ต้องไม่ว่าง'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    device, created = OutputDevice.objects.get_or_create(
        platform=platform,
        device_id=device_id,
        defaults={'name': label},
    )
    if not created and device.name != label:
        device.name = label
        device.save(update_fields=['name', 'updated_at'])

    OutputDeviceSelection.objects.create(
        device=device,
        device_id_legacy=device_id,
        source='auto_capture',
    )

    return Response(OutputDeviceSerializer(device).data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
def output_device_current(request: Request) -> Response:
    """Return the most recent selection's device (or None)."""
    selection = OutputDeviceSelection.objects.first()
    if selection is None or selection.device is None:
        return Response({'device': None})
    return Response({'device': OutputDeviceSerializer(selection.device).data})