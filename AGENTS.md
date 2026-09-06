# MENA AI VTuber — Agent Instructions

## Project Overview

AI VTuber system: Django REST Framework backend + Vite React TypeScript frontend. Characters respond to chat via a local Free LLM API, with YouTube live Chat integration and TTS support.

## Architecture

```
D:/mena_ai/
├── backend/                # Django 6.1 + DRF
│   ├── config/             # settings, urls, wsgi/asgi
│   ├── core/               # main app: models, views, serializers
│   │   ├── models.py       # Character, ChatMessage, LLMProvider
│   │   ├── views.py        # chat endpoint, ViewSets, prompt generation
│   │   ├── services.py     # LLMService (calls Free LLM API)
│   │   ├── youtube_views.py      # YouTube live chat control
│   │   ├── youtube_chat.py       # pytchat streaming worker
│   │   ├── tts_service.py        # edge-tts wrapper
│   │   └── tts_views.py          # TTS API endpoints
│   ├── manage.py
│   └── requirements.txt
├── frontend/               # Vite + React 19 + TypeScript + Tailwind v4
│   ├── src/
│   │   ├── pages/          # HomePage, ChatPage, CharactersPage, SettingsPage
│   │   ├── components/ui/  # shadcn-style: Button, Card, Input
│   │   ├── services/api.ts # axios client, typed API wrappers
│   │   └── types/index.ts  # TypeScript interfaces
│   └── vite.config.ts
└── .venv/                  # Python 3.14 venv (Windows)
```

## Key Conventions

- **Python**: 3.14, Django 6.1, DRF. Venv at `.venv/` (activate: `source .venv/Scripts/activate`)
- **Frontend**: Vite proxy forwards `/api` → Django `:8000`. Run with `npm run dev` (port 5173)
- **API base**: `/api` (proxied in dev, served by Django in prod)
- **LLM**: Free LLM API at `http://127.0.0.1:31415/v1/chat/completions` (model=auto)
- **TTS**: `edge-tts` (Microsoft Edge TTS), voices cached in `backend/tts_cache/`
- **YouTube chat**: pytchat (real-time streaming, NOT yt-dlp)
- **Database**: SQLite (`backend/db.sqlite3`)
- **Language**: User is Thai-speaking; UI text and comments mix Thai + English

## Running the Stack

```bash
# Backend (port 8000)
cd D:/mena_ai/backend && source ../.venv/Scripts/activate && python manage.py runserver 0.0.0.0:8000

# Frontend (port 5173)
cd D:/mena_ai/frontend && npm run dev

# Migrate after model changes
cd D:/mena_ai/backend && source ../.venv/Scripts/activate && python manage.py makemigrations && python manage.py migrate
```

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/chat/` | Send chat message, get AI response |
| GET/POST | `/api/characters/` | Character CRUD |
| POST | `/api/characters/{id}/generate-prompt/` | AI-generate system prompt from history |
| GET/POST | `/api/llm-providers/` | LLM provider config CRUD |
| GET | `/api/messages/` | Chat history (read-only) |
| GET | `/api/health/` | Health check |
| GET | `/api/llm-status/` | LLM API connectivity status |
| POST | `/api/yt-chat/start/` | Start YouTube live chat session |
| POST | `/api/yt-chat/stop/` | Stop YouTube chat session |
| GET | `/api/yt-chat/status/` | Get active YouTube session status |
| GET | `/api/yt-messages/` | YouTube chat messages (filter: `?session_id=`) |
| GET | `/api/yt-sessions/` | YouTube session history |
| POST | `/api/tts/generate/` | Generate TTS audio (returns audio blob) |
| GET | `/api/tts/voices/` | List available TTS voices |
| POST | `/api/tts/chat-message/` | TTS for a chat message |

## Chat Request Format

```json
POST /api/chat/
{
  "character_id": "<uuid>",
  "message": "Hello!",
  "user_name": "warit"  // optional, enables per-user memory
}
```

## Character Model Fields

- `name`, `name_th`, `name_en` — display names
- `system_prompt` — base persona (supports `{name_th}`, `{name_en}`, `{response_length_instruction}` templates)
- `system_prompt_ai` — AI-augmented prompt from chat history (max 8000 chars)
- `response_language` — forced response language (default: `thai`)
- `response_length` — `short` (1-2 sentences), `normal`, `long`, `custom`
- `custom_max_tokens` — used when response_length is `custom`
- `enable_per_user_memory` — remember users by name (default: true)
- `memory_duration_days` — how long to keep user history (default: 3)

## Code Style

- Backend: Django conventions, DRF ViewSets for CRUD, `@api_view` for custom endpoints
- Frontend: Functional components, hooks, Tailwind utility classes, shadcn/ui components
- API service layer in `frontend/src/services/api.ts` — always use typed wrappers, not raw axios
- Type definitions in `frontend/src/types/index.py`

## Common Patterns

- **Character cache**: In-memory `_character_cache` dict in views.py — cleared on update/delete
- **Rate limiting**: Simple in-memory rate limiter (`_rate_limit_store`) for chat endpoint
- **YouTube chat**: Background thread via pytchat; auto-reply calls LLM API per message
- **TTS**: Async edge-tts generation, cached by hash of text+voice+rate

## Testing

- Backend: `python manage.py test` (Django test framework)
- Frontend: No test runner configured yet
- Manual: Use `curl` or Postman against `http://localhost:8000/api/`

## Environment Variables (backend/.env)

```
DJANGO_SECRET_KEY=...
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
FREE_LLM_API_URL=http://127.0.0.1:31415/v1/chat/completions
FREE_LLM_API_KEY=...
FREE_LLM_MODEL=auto
```

## Gotchas

- Venv activation on Windows uses `Scripts/activate` (not `bin/activate`)
- `edge-tts` requires `asyncio` — TTS views are async Django views
- YouTube chat uses pytchat which needs the video to be **currently live**
- Free LLM API must be running separately at port 31415
- Vite config uses `__dirname` (shows warning but works)
