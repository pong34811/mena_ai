#!/bin/sh
set -e

# Run migrations
python manage.py migrate --noinput

# Start Daphne (ASGI server with WebSocket support)
exec daphne -b 0.0.0.0 -p 8000 config.asgi:application
