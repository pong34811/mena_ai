"""
TTS Service - Text-to-Speech using edge-tts (free, high-quality, Thai support).

Provides:
- Text-to-speech conversion with multiple voice options
- Audio file generation and caching
- Support for Thai, English, Japanese and other languages
"""

import os
import asyncio
import hashlib
import logging
import re
from pathlib import Path
from typing import Optional

import edge_tts
from django.conf import settings

logger = logging.getLogger(__name__)

# Voice options by language (verified available voices)
VOICE_OPTIONS = {
    'thai': [
        {'id': 'th-TH-PremwadeeNeural', 'name': 'Thai Female (Premwadee)', 'gender': 'Female'},
        {'id': 'th-TH-NiwatNeural', 'name': 'Thai Male (Niwat)', 'gender': 'Male'},
    ],
    'english': [
        {'id': 'en-US-AriaNeural', 'name': 'US Aria (Female)', 'gender': 'Female'},
        {'id': 'en-US-GuyNeural', 'name': 'US Guy (Male)', 'gender': 'Male'},
        {'id': 'en-US-JennyNeural', 'name': 'US Jenny (Female)', 'gender': 'Female'},
        {'id': 'en-US-MichelleNeural', 'name': 'US Michelle (Female)', 'gender': 'Female'},
        {'id': 'en-GB-SoniaNeural', 'name': 'UK Sonia (Female)', 'gender': 'Female'},
        {'id': 'en-GB-RyanNeural', 'name': 'UK Ryan (Male)', 'gender': 'Male'},
    ],
    'japanese': [
        {'id': 'ja-JP-NanamiNeural', 'name': 'JP Nanami (Female)', 'gender': 'Female'},
        {'id': 'ja-JP-KeitaNeural', 'name': 'JP Keita (Male)', 'gender': 'Male'},
    ],
}

# Default voice
DEFAULT_VOICE = 'th-TH-PremwadeeNeural'

# Cache directory for audio files
CACHE_DIR = Path(getattr(settings, 'BASE_DIR', Path(__file__).resolve().parent.parent)) / 'tts_cache'
CACHE_DIR.mkdir(exist_ok=True)

# Maximum cache size (number of files)
MAX_CACHE_SIZE = 100


def normalize_rate(rate: str) -> str:
    """Normalize a speech rate into edge-tts format (e.g. '+10%', '-5%').

    Accepts edge-tts format directly, or a speed multiplier like '1.0'/'1.1'
    (sent by older frontend defaults) which is converted to a percentage.
    Falls back to '+0%' for anything unparseable.
    """
    if not rate:
        return '+0%'
    rate = str(rate).strip()
    if re.fullmatch(r'[+-]?\d+%', rate):
        return rate if rate.startswith(('+', '-')) else f'+{rate}'
    try:
        mult = float(rate)
        pct = round((mult - 1) * 100)
        return f'+{pct}%' if pct >= 0 else f'{pct}%'
    except (ValueError, TypeError):
        logger.warning(f"Unparseable TTS rate {rate!r}, falling back to '+0%'")
        return '+0%'


def get_cache_path(text: str, voice: str, rate: str = '+0%') -> Path:
    """Generate a cache file path for given text, voice and rate."""
    text_hash = hashlib.md5(f"{voice}:{rate}:{text}".encode('utf-8')).hexdigest()
    return CACHE_DIR / f"{text_hash}.mp3"


def cleanup_cache():
    """Remove oldest cache files if cache exceeds max size."""
    files = sorted(CACHE_DIR.glob('*.mp3'), key=lambda f: f.stat().st_mtime)
    while len(files) > MAX_CACHE_SIZE:
        oldest = files.pop(0)
        try:
            oldest.unlink()
        except OSError:
            pass


class TTSService:
    """Text-to-Speech service using edge-tts."""
    
    def __init__(self, voice: str = DEFAULT_VOICE, rate: str = "+0%"):
        """
        Initialize TTS service.

        Args:
            voice: Voice ID (e.g., 'th-TH-PremwadeeNeural')
            rate: Speech rate adjustment (e.g., '+10%', '-10%').
                Speed multipliers like '1.0' are normalized automatically.
        """
        self.voice = voice
        self.rate = normalize_rate(rate)
    
    async def _generate_async(self, text: str, output_path: Path) -> bool:
        """Generate audio file asynchronously."""
        try:
            communicate = edge_tts.Communicate(text, self.voice, rate=self.rate)
            await communicate.save(str(output_path))
            return True
        except Exception as e:
            logger.error(f"TTS generation failed: {e}")
            return False
    
    def generate(self, text: str, use_cache: bool = True) -> Optional[Path]:
        """
        Generate audio file from text.
        
        Args:
            text: Text to convert to speech
            use_cache: Whether to use cached audio if available
            
        Returns:
            Path to generated audio file, or None if failed
        """
        if not text or not text.strip():
            return None
        
        # Truncate very long text (edge-tts limit + VTuber style = short)
        # 300 chars ≈ 4-5 sentences, keeps TTS fast (3-8s) while sounding complete
        if len(text) > 300:
            text = text[:300]
        
        cache_path = get_cache_path(text, self.voice, self.rate)
        
        # Return cached file if exists
        if use_cache and cache_path.exists():
            logger.debug(f"TTS cache hit: {cache_path.name}")
            return cache_path
        
        # Generate new audio (always run in new event loop to avoid Django issues)
        try:
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(
                    asyncio.run,
                    self._generate_async(text, cache_path)
                )
                success = future.result(timeout=30)
        except Exception as e:
            logger.error(f"TTS generation error: {e}")
            return None
        
        if success:
            cleanup_cache()
            return cache_path
        
        return None
    
    def get_audio_bytes(self, text: str, use_cache: bool = True) -> Optional[bytes]:
        """
        Get audio bytes from text.
        
        Args:
            text: Text to convert to speech
            use_cache: Whether to use cached audio if available
            
        Returns:
            Audio file bytes, or None if failed
        """
        cache_path = self.generate(text, use_cache)
        if cache_path and cache_path.exists():
            return cache_path.read_bytes()
        return None


def get_voices_for_language(language: str) -> list[dict]:
    """Get available voices for a language."""
    lang = language.lower()
    for key, voices in VOICE_OPTIONS.items():
        if key in lang or lang in key:
            return voices
    # Return all voices if no match
    all_voices = []
    for voices in VOICE_OPTIONS.values():
        all_voices.extend(voices)
    return all_voices


def get_all_voices() -> dict[str, list[dict]]:
    """Get all available voices grouped by language."""
    return VOICE_OPTIONS
