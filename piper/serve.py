"""Local Piper TTS HTTP sidecar.

POST /v1/tts  {"text": "...", "voice": "th_TH-tsync2-medium", "length_scale": 1.0}
  -> MP3 bytes (PCM16 -> WAV in memory -> ffmpeg -> MP3), content-type audio/mpeg
GET  /healthz -> {"status": "ok"}

On startup the container pre-downloads the configured voice into VOICES_DIR.
"""
import io
import logging
import subprocess
import threading
import wave
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from piper import PiperVoice, SynthesisConfig
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("piper-sidecar")

VOICES_DIR = "/models"
DEFAULT_VOICE = "th_TH-tsync2-medium"


@asynccontextmanager
async def lifespan(app: FastAPI):
    _load_piper()
    yield


app = FastAPI(title="Piper TTS sidecar", version="1.0", lifespan=lifespan)

_piper = None
_lock = threading.Lock()


class TTSRequest(BaseModel):
    text: str = Field(..., max_length=2000)
    voice: str = DEFAULT_VOICE
    length_scale: float = 1.0
    noise_scale: float = 0.667
    noise_w: float = 0.8


def _load_piper() -> PiperVoice:
    global _piper
    if _piper is None:
        with _lock:
            if _piper is None:
                logger.info("Loading piper voice %s...", DEFAULT_VOICE)
                _piper = PiperVoice.load(f"{VOICES_DIR}/{DEFAULT_VOICE}.onnx")
                logger.info("Piper voice loaded (sr=%s).", _piper.config.sample_rate)
    return _piper


def _wav_bytes(text: str, length_scale: float, noise_scale: float, noise_w: float) -> bytes:
    voice = _load_piper()
    config = SynthesisConfig(
        length_scale=length_scale,
        noise_scale=noise_scale,
        noise_w_scale=noise_w,
    )
    sample_rate = voice.config.sample_rate
    pcm = bytearray()
    # Serialize onnxruntime inference (piper is single-model, CPU-heavy).
    # Voice loading is done above the lock, so no re-entrant deadlock.
    with _lock:
        for chunk in voice.synthesize(text, config):
            pcm += chunk.audio_int16_bytes

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(bytes(pcm))
    return buf.getvalue()


def _to_mp3(wav: bytes) -> bytes:
    proc = subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-f", "wav", "-i", "pipe:0",
            "-codec:a", "libmp3lame", "-q:a", "2",
            "-f", "mp3", "pipe:1",
        ],
        input=wav,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg mp3 conversion failed: {proc.stderr.decode(errors='replace')[:500]}")
    return proc.stdout


@app.get("/healthz")
async def healthz():
    return {"status": "ok", "voice": DEFAULT_VOICE}


# Plain `def` (not async) so FastAPI runs synthesis in a worker thread and the
# event loop stays responsive (healthz included) while a request is synthesizing.
@app.post("/v1/tts")
def synthesize(req: TTSRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    if req.voice != DEFAULT_VOICE:
        raise HTTPException(status_code=400, detail=f"only voice {DEFAULT_VOICE!r} is supported")
    try:
        wav = _wav_bytes(req.text, req.length_scale, req.noise_scale, req.noise_w)
        mp3 = _to_mp3(wav)
        return Response(content=mp3, media_type="audio/mpeg")
    except Exception as e:  # noqa: BLE001
        logger.exception("Synthesis failed")
        raise HTTPException(status_code=500, detail=str(e)) from e