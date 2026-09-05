"""
Views for VTube Studio API connection settings.
"""
import asyncio
import json
import logging

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import VTubeStudioSettings
from .serializers import VTubeStudioSettingsSerializer

logger = logging.getLogger(__name__)


@api_view(['GET'])
def vtube_settings_get(request):
    """Get current VTube Studio connection settings."""
    settings = VTubeStudioSettings.get_instance()
    serializer = VTubeStudioSettingsSerializer(settings)
    return Response(serializer.data)


@api_view(['PATCH'])
def vtube_settings_update(request):
    """Update VTube Studio connection settings."""
    settings = VTubeStudioSettings.get_instance()
    serializer = VTubeStudioSettingsSerializer(settings, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
def vtube_test_connection(request):
    """Test WebSocket connection to VTube Studio API."""
    settings = VTubeStudioSettings.get_instance()
    api_url = settings.api_url

    try:
        import websockets
    except ImportError:
        return Response(
            {'error': 'websockets package not installed. Run: pip install websockets'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    async def _test():
        try:
            async with websockets.connect(api_url, open_timeout=5) as ws:
                # Request API state to verify it's really VTube Studio
                await ws.send(json.dumps({
                    'apiName': 'VTubeStudioPublicAPI',
                    'apiVersion': '1.0',
                    'requestID': 'test-connection',
                    'messageType': 'APIStateRequest'
                }))
                response = await asyncio.wait_for(ws.recv(), timeout=5)
                data = json.loads(response)
                return {
                    'success': True,
                    'message': 'เชื่อมต่อ VTube Studio สำเร็จ',
                    'api_response': data,
                }
        except asyncio.TimeoutError:
            return {'success': False, 'message': 'หมดเวลา (timeout) — ตรวจสอบว่า VTube Studio เปิด API แล้ว'}
        except ConnectionRefusedError:
            return {'success': False, 'message': 'ปฏิเสธการเชื่อมต่อ — ตรวจสอบ Port และว่า VTube Studio ทำงานอยู่'}
        except Exception as e:
            return {'success': False, 'message': f'ไม่สามารถเชื่อมต่อได้: {str(e)}'}

    try:
        result = asyncio.run(_test())
    except RuntimeError:
        # If there's already a running event loop
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(_test())
        loop.close()

    # Update connection status
    settings.is_connected = result.get('success', False)
    settings.save(update_fields=['is_connected'])

    if result.get('success'):
        return Response(result)
    return Response(result, status=status.HTTP_502_BAD_GATEWAY)
