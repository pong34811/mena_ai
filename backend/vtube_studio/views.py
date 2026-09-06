"""
Views for VTube Studio API connection settings and mouth control.
"""
import asyncio
import json
import logging

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import VTubeStudioSettings
from .serializers import VTubeStudioSettingsSerializer
from .services import get_vtube_service

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


@api_view(['POST'])
def vtube_mouth_start(request):
    """
    Start mouth movement for TTS playback.

    Request body:
        - duration_seconds: How long to move the mouth (optional, default: 5.0)

    Starts a background thread that sends MouthOpen values to VTube Studio
    to simulate speech while TTS audio is playing.
    """
    duration = request.data.get('duration_seconds', 5.0)
    try:
        duration = float(duration)
        if duration <= 0 or duration > 60:
            duration = 5.0
    except (TypeError, ValueError):
        duration = 5.0

    service = get_vtube_service()

    # Ensure connection is ready
    if not service.ensure_connected():
        return Response(
            {'error': 'ไม่สามารถเชื่อมต่อ VTube Studio ได้ — ตรวจสอบการตั้งค่าการเชื่อมต่อ'},
            status=status.HTTP_502_BAD_GATEWAY
        )

    service.start_mouth_movement(duration)

    return Response({
        'success': True,
        'message': f'เริ่มขยับปากสำหรับ {duration} วินาที',
        'duration_seconds': duration,
    })


@api_view(['POST'])
def vtube_mouth_stop(request):
    """
    Stop mouth movement immediately.

    Stops the background thread that moves the mouth.
    """
    service = get_vtube_service()
    service.stop_mouth_movement()

    return Response({
        'success': True,
        'message': 'หยุดขยับปากแล้ว',
    })


@api_view(['GET'])
def vtube_mouth_status(request):
    """
    Get current mouth movement status.
    """
    service = get_vtube_service()

    return Response({
        'is_moving': service._mouth_running,
        'connected': service.ws is not None,
        'authenticated': service.authenticated,
    })


@api_view(['POST'])
def vtube_mouth_test(request):
    """
    Test mouth movement — sends a quick open/close pattern.

    Request body:
        - open_amount: MouthOpen value 0-1 (optional, default: 0.7)
    """
    open_amount = request.data.get('open_amount', 0.7)
    try:
        open_amount = float(open_amount)
        open_amount = max(0.0, min(1.0, open_amount))
    except (TypeError, ValueError):
        open_amount = 0.7

    service = get_vtube_service()

    if not service.ensure_connected():
        return Response(
            {'error': 'ไม่สามารถเชื่อมต่อ VTube Studio ได้'},
            status=status.HTTP_502_BAD_GATEWAY
        )

    async def _test_mouth():
        # Open
        await service.inject_parameter('MouthOpen', open_amount)
        await asyncio.sleep(0.3)
        # Close
        await service.inject_parameter('MouthOpen', 0.0)

    try:
        asyncio.run(_test_mouth())
    except Exception as e:
        return Response(
            {'error': f'ทดสอบล้มเหลว: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    return Response({
        'success': True,
        'message': f'ทดสอบขยับปาก (ระดับ {open_amount}) สำเร็จ',
    })
