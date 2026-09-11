# Design: Switch TTS from edge-tts to local Piper (sidecar)

**Date:** 2026-09-11
**Status:** Approved
**User decisions:** Full switch to local TTS · Piper sidecar (HTTP) architecture · Thai voice only

## Problem

edge-tts (Microsoft) rate-limits concurrent WebSocket connections from a single IP.
During YouTube live streams, concurrent/rapid TTS requests fail with `NoAudioReceived`.
Mitigations already in place (semaphore + retry + emoji strip) reduce but do not eliminate failures.

## Goal

Replace edge-tts with a **local, free, no-rate-limit** TTS engine: **Piper**, running as a
sidecar Docker container, speaking **Thai only** (`th_TH-tsync2-medium`).

Acceptable trade-off (user-approved): Piper Thai quality ("medium") is noticeably more robotic
than Azure `PremwadeeNeural`, and its license is CC BY-NC-SA (non-commercial).

## Architecture

```
┌──────── backend (Django, py3.14) ────────┐        ┌──────── piper service (py3.12) ────────┐
│  tts_service.generate()  ──HTTP POST──▶  │ 8888   │  FastAPI  /v1/tts                        │
│  tasks.generate_tts (Celery)             │ ─────▶ │  piper-tts → WAV → ffmpeg → MP3         │
│  writes MP3 to tts_cache                 │        │  Thai voice ONNX baked at build         │
└──────────────────────────────────────────┘        └──────────────────────────────────────────┘
```

- New `piper` service in `docker-compose.yml`, built from `./piper/Dockerfile`.
- Backend talks to `PIPER_TTS_URL` (compose: `http://piper:8888`, dev: `http://localhost:8888`).
- Response is **MP3** — so `tts_views.py`, cache `.mp3` extension, `FileResponse(content_type='audio/mpeg')`,
  and the frontend (`useHowlerTTS` `format: ['mp3']`) remain **unchanged**.

## Piper sidecar

- Base image `python:3.12-slim` (py3.14 lacks onnxruntime/phonemize wheel support → sidecar avoids it).
- Install: `piper-tts`, `fastapi`, `uvicorn`, `soundfile`, `numpy`, and `ffmpeg` (apt) for MP3 conversion.
- Bake the Thai voice at build time:
  - `https://huggingface.co/rhasspy/piper-voices/resolve/main/th/th_TH/tsync2/medium/th_TH-tsync2-medium.onnx`
  - `https://huggingface.co/rhasspy/piper-voices/resolve/main/th/th_TH/tsync2/medium/th_TH-tsync2-medium.onnx.json`
  - (verified present 2026-09-11)
- `serve.py` — FastAPI app:
  - `POST /v1/tts` body `{"text": str, "voice": str, "length_scale": float}`
  - `GET /healthz` for container health check
  - Loads `PiperVoice` once per voice (double-checked lock; only one voice here).
  - Synthesizes WAV (temp file), converts to MP3 via `ffmpeg`, returns `audio/mpeg` bytes.
  - On error returns 500 with a small JSON error body.
  - Thread-safe; heavy synth calls are naturally serialized by the single voice instance + GIL.

## Backend changes

### `core/tts_service.py`
- Remove `import edge_tts` and the subprocess edge-tts script.
- `TTSService.generate(text, use_cache)`:
  1. Strip emojis, trim empty → None (kept).
  2. Truncate >300 chars (kept).
  3. Resolve voice: `VOICE_ALIAS_MAP.get(id, id)` → validate against whitelist → default.
  4. Convert rate: `length_scale = 100 / (100 + pct)` from `normalize_rate()` result.
  5. Cache check → return `cache_path` (unchanged, `.mp3`).
  6. POST `${PIPER_TTS_URL}/v1/tts` (timeout 15s). On success write bytes to `cache_path`, `cleanup_cache()`, return.
  7. Connection/HTTP error → single retry after 0.5s → then `logger.error`, return None.
  8. Semaphore kept at **2** to cap CPU under load (no longer about rate limits).
- `VOICE_OPTIONS`: Thai only:
  - `{'id': 'th_TH-tsync2-medium', 'name': 'Thai Female (tsync2)', 'gender': 'Female'}`
- `DEFAULT_VOICE = 'th_TH-tsync2-medium'`.
- `VOICE_ALIAS_MAP` maps every legacy edge id used in the repo to the new id:
  `th-TH-PremwadeeNeural`, `th-TH-NiwatNeural`, `en-US-AriaNeural`, `en-US-GuyNeural`,
  `en-US-JennyNeural`, `en-US-MichelleNeural`, `en-GB-SoniaNeural`, `en-GB-RyanNeural`,
  `ja-JP-NanamiNeural`, `ja-JP-KeitaNeural` → `th_TH-tsync2-medium`.

### `core/tasks.py`
- Remove `import edge_tts` / the async edge synthesize + `NoAudioReceived` retry.
- Delegate generation to `TTSService` (shared HTTP logic) to avoid duplication; keep the same
  dict `{"success", "audio_path", "cache_key", "error"}` contract and Celery retry wrapper.
- Keep emoji strip.

### `messages_tts/models.py`
- Change `questioner_voice` / `responder_voice` defaults to `th_TH-tsync2-medium`.
- Add a `CharField` migration updating the column default (existing rows are covered by the alias map;
  no data migration required).

### `requirements.txt`
- Remove `edge-tts>=7.0`. No new packages needed (`requests` already present).

### `backend/.env`
- Add `PIPER_TTS_URL=http://localhost:8888` (overridden in compose to `http://piper:8888`).

## Frontend changes (minimal)

- `src/services/api.ts` — default voice fallback `'th-TH-PremwadeeNeural'` → `'th_TH-tsync2-medium'`.
- `src/pages/ChatPage.tsx` — `questioner_voice` / `responder_voice` defaults → new id.
- `src/hooks/useHowlerTTS.ts` — `defaultSettings` voice → new id.
- No audio-format changes (still MP3).

## docker-compose.yml

Add service:

```yaml
  piper:
    build: ./piper
    ports:
      - "8888:8888"
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8888/healthz"]
```

`backend` and `celery-worker` each add `PIPER_TTS_URL: http://piper:8888` + `depends_on: piper`.

## Error handling

- Piper never rate-limits. Retry only on connectivity (once, 0.5s).
- Piper down → view returns the existing 500 JSON (`{'error': 'TTS generation failed'}`); frontend already
  logs and skips.
- Cache still absorbs duplicate phrases so piper load stays low.

## Testing

1. Update `backend/core/tests/test_tasks.py` — mock the HTTP call (or `TTSService`) instead of
   `edge_tts.Communicate`; keep cache-hit and validation tests.
2. Update `backend/messages_tts/tests.py` + `backend/core/tests/` default-voice strings.
3. Update frontend test fixtures (`api.test.ts`, `useHowlerTTS*.test.ts`, `TtsConfigModal.test.tsx`)
   voice strings.
4. Docker smoke test: `POST /api/tts/generate/` with Thai text → 200, body is valid MP3 (>1KB).
5. `docker compose up -d --build piper backend celery-worker` → all healthy.

## Risks / gates

- **Thai license (CC BY-NC-SA)** — non-commercial use only. User accepted.
- **piper-tts wheel on py3.12 in slim image** — expected OK (`py3-none-any` + onnxruntime 3.12 wheels);
  verify at build. If piper-tts install fails, fall back to `python:3.12-slim` + pip `piper-phonemize-fix`
  workaround (documented community fix).
- **Model file URL stability** — pinned URLs verified; commit SHA can be pinned in the Dockerfile for
  repeatability.
- Voice quality drop is user-accepted.