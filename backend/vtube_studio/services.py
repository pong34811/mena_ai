"""
VTube Studio Service - WebSocket API client for controlling Live2D model parameters.

Handles:
- WebSocket connection and authentication
- Injecting parameter values (MouthOpen, etc.)
- Background thread for TTS-driven mouth movement
"""
import asyncio
import json
import logging
import time
import threading
import random
from typing import Optional

import websockets

from .models import VTubeStudioSettings

logger = logging.getLogger(__name__)


class VTubeStudioService:
    """Service for interacting with VTube Studio WebSocket API."""

    def __init__(self):
        self.settings = VTubeStudioSettings.get_instance()
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.authenticated = False
        self.auth_token: Optional[str] = None
        self._mouth_thread: Optional[threading.Thread] = None
        self._mouth_running = False
        self._mouth_lock = threading.Lock()

    async def connect(self) -> bool:
        """Connect to VTube Studio WebSocket API."""
        try:
            self.ws = await websockets.connect(
                self.settings.api_url,
                open_timeout=5
            )
            # Check API state
            await self.ws.send(json.dumps({
                'apiName': 'VTubeStudioPublicAPI',
                'apiVersion': '1.0',
                'requestID': 'connect-check',
                'messageType': 'APIStateRequest'
            }))
            response = await asyncio.wait_for(self.ws.recv(), timeout=5)
            data = json.loads(response)
            if data.get('messageType') == 'APIStateResponse':
                logger.info(f"Connected to VTube Studio v{data['data'].get('vTubeStudioVersion', '?')}")
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to connect to VTube Studio: {e}")
            return False

    async def authenticate(self) -> bool:
        """Authenticate with VTube Studio API."""
        if not self.ws:
            return False

        # If we already have a token, try to authenticate with it
        if self.auth_token:
            return await self._do_authenticate()

        # Otherwise request a new token
        try:
            await self.ws.send(json.dumps({
                'apiName': 'VTubeStudioPublicAPI',
                'apiVersion': '1.0',
                'requestID': 'auth-token-request',
                'messageType': 'AuthenticationTokenRequest',
                'data': {
                    'pluginName': 'MENA AI VTuber',
                    'pluginDeveloper': 'MENA Team',
                }
            }))
            response = await asyncio.wait_for(self.ws.recv(), timeout=10)
            data = json.loads(response)
            if data.get('messageType') == 'AuthenticationTokenResponse':
                self.auth_token = data['data']['authenticationToken']
                logger.info("Got authentication token")
                return await self._do_authenticate()
            elif data.get('messageType') == 'APIError':
                logger.error(f"Auth token request failed: {data['data'].get('message')}")
                return False
        except Exception as e:
            logger.error(f"Authentication failed: {e}")
        return False

    async def _do_authenticate(self) -> bool:
        """Send authentication request with token."""
        try:
            await self.ws.send(json.dumps({
                'apiName': 'VTubeStudioPublicAPI',
                'apiVersion': '1.0',
                'requestID': 'authenticate',
                'messageType': 'AuthenticationRequest',
                'data': {
                    'pluginName': 'MENA AI VTuber',
                    'pluginDeveloper': 'MENA Team',
                    'authenticationToken': self.auth_token,
                }
            }))
            response = await asyncio.wait_for(self.ws.recv(), timeout=5)
            data = json.loads(response)
            if data.get('messageType') == 'AuthenticationResponse':
                self.authenticated = data['data'].get('authenticated', False)
                if self.authenticated:
                    logger.info("Authenticated with VTube Studio")
                return self.authenticated
        except Exception as e:
            logger.error(f"Authentication request failed: {e}")
        return False

    async def inject_parameter(self, param_id: str, value: float, weight: float = 1.0) -> bool:
        """Inject a parameter value into VTube Studio."""
        if not self.ws or not self.authenticated:
            return False

        try:
            await self.ws.send(json.dumps({
                'apiName': 'VTubeStudioPublicAPI',
                'apiVersion': '1.0',
                'requestID': f'inject-{param_id}-{time.time()}',
                'messageType': 'InjectParameterDataRequest',
                'data': {
                    'mode': 'set',
                    'parameterValues': [
                        {
                            'id': param_id,
                            'value': max(-1000000, min(1000000, value)),
                            'weight': weight,
                        }
                    ]
                }
            }))
            return True
        except Exception as e:
            logger.error(f"Failed to inject parameter {param_id}: {e}")
            return False

    async def close(self):
        """Close WebSocket connection."""
        if self.ws:
            try:
                await self.ws.close()
            except Exception:
                pass
            self.ws = None
            self.authenticated = False

    def ensure_connected(self) -> bool:
        """Ensure we have an active, authenticated connection."""
        async def _ensure():
            if not self.ws:
                if not await self.connect():
                    return False
            if not self.authenticated:
                if not await self.authenticate():
                    return False
            return True

        try:
            return asyncio.run(_ensure())
        except RuntimeError:
            loop = asyncio.new_event_loop()
            result = loop.run_until_complete(_ensure())
            loop.close()
            return result

    # ─── TTS Mouth Movement ──────────────────────────────────────────────

    def start_mouth_movement(self, duration_seconds: float = 5.0):
        """Start background thread that moves the mouth for TTS playback."""
        with self._mouth_lock:
            if self._mouth_running:
                # Already running — extend duration
                self._mouth_running = True
                self._mouth_end_time = time.time() + duration_seconds
                logger.info(f"Extended mouth movement by {duration_seconds}s")
                return

            self._mouth_running = True
            self._mouth_end_time = time.time() + duration_seconds
            self._mouth_thread = threading.Thread(
                target=self._mouth_movement_loop,
                args=(duration_seconds,),
                daemon=True
            )
            self._mouth_thread.start()
            logger.info(f"Started mouth movement for {duration_seconds}s")

    def stop_mouth_movement(self):
        """Stop the mouth movement thread."""
        with self._mouth_lock:
            self._mouth_running = False
            self._mouth_end_time = 0
        logger.info("Stopped mouth movement")

    def _mouth_movement_loop(self, duration_seconds: float):
        """Background loop that sends MouthOpen values to simulate speech."""
        # Ensure connection
        if not self.ensure_connected():
            logger.warning("Cannot start mouth movement: not connected to VTube Studio")
            self._mouth_running = False
            return

        start_time = time.time()
        end_time = start_time + duration_seconds

        # Speech pattern: rapid open/close with pauses
        # Typical speech: ~3-5 syllables per second, with variation
        syllable_rate = 4.5  # syllables per second
        time_per_syllable = 1.0 / syllable_rate

        async def _send_loop():
            nonlocal end_time
            while True:
                with self._mouth_lock:
                    if not self._mouth_running:
                        break
                    # Check if extended
                    if self._mouth_end_time > end_time:
                        end_time = self._mouth_end_time
                    if time.time() >= end_time:
                        break

                # Generate one "syllable" of mouth movement
                # Pattern: open quickly, hold, close quickly
                syllable_duration = time_per_syllable * random.uniform(0.7, 1.3)
                open_time = syllable_duration * 0.3
                hold_time = syllable_duration * 0.3
                close_time = syllable_duration * 0.4

                # Open mouth (random amount for natural feel)
                open_amount = random.uniform(0.3, 0.9)
                await self.inject_parameter('MouthOpen', open_amount)
                await asyncio.sleep(open_time)

                # Hold
                await self.inject_parameter('MouthOpen', open_amount * 0.7)
                await asyncio.sleep(hold_time)

                # Close
                await self.inject_parameter('MouthOpen', 0.0)
                await asyncio.sleep(close_time)

                # Small pause between syllables (sometimes)
                if random.random() < 0.3:
                    await asyncio.sleep(random.uniform(0.05, 0.15))

            # Ensure mouth is closed at end
            await self.inject_parameter('MouthOpen', 0.0)

        try:
            asyncio.run(_send_loop())
        except Exception as e:
            logger.error(f"Mouth movement loop error: {e}")
        finally:
            self._mouth_running = False
            logger.info("Mouth movement loop ended")


# Singleton service instance
_vtube_service: Optional[VTubeStudioService] = None


def get_vtube_service() -> VTubeStudioService:
    """Get or create the singleton VTubeStudioService instance."""
    global _vtube_service
    if _vtube_service is None:
        _vtube_service = VTubeStudioService()
    return _vtube_service
