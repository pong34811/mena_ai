"""
Management command to connect YouTube live chat to AI Characters.

Usage:
    python manage.py youtube_chat <video_id> [--character-id UUID] [--dry-run]

This connects to a YouTube live stream's chat using pytchat and feeds
each new message to the selected Character (LLM), then prints the response.
"""

import logging
import signal
import sys
import uuid

from django.core.management.base import BaseCommand, CommandError

from core.models import Character
from core.youtube_chat import YouTubeLiveChatService, ChatMessage
from core.services import LLMService, LLMServiceError

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Connect YouTube live chat to AI Characters for auto-reply"

    def add_arguments(self, parser):
        parser.add_argument("video_id", type=str, help="YouTube video ID (e.g., Af7pRKJYFE0)")
        parser.add_argument(
            "--character-id",
            type=uuid.UUID,
            help="Character UUID to use for replies (default: first active character)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Only print chat messages, don't send to LLM",
        )
        parser.add_argument(
            "--poll-interval",
            type=float,
            default=1.0,
            help="Chat polling interval in seconds (default: 1.0)",
        )

    def handle(self, *args, **options):
        video_id = options["video_id"]
        character_id = options["character_id"]
        dry_run = options["dry_run"]
        poll_interval = options["poll_interval"]

        # Get character
        if character_id:
            try:
                character = Character.objects.get(id=character_id)
            except Character.DoesNotExist:
                raise CommandError(f"Character with ID {character_id} not found")
        else:
            character = Character.objects.filter(is_active=True).first()
            if not character:
                raise CommandError("No active characters found. Create one first.")

        self.stdout.write(self.style.SUCCESS(f"Video ID: {video_id}"))
        self.stdout.write(self.style.SUCCESS(f"Character: {character.name}"))
        self.stdout.write(self.style.SUCCESS(f"Dry run: {dry_run}"))
        self.stdout.write(self.style.SUCCESS(f"Poll interval: {poll_interval}s"))
        self.stdout.write("=" * 60)

        # Build LLM service
        llm = LLMService() if not dry_run else None

        # Track stats
        stats = {"messages_received": 0, "replies_sent": 0, "errors": 0}

        def on_message(msg: ChatMessage):
            """Handle incoming chat message."""
            stats["messages_received"] += 1

            # Format output
            badges = ""
            if msg.is_owner:
                badges += " [OWNER]"
            elif msg.is_mod:
                badges += " [MOD]"
            if msg.is_super_chat:
                badges += " [SUPER CHAT]"

            self.stdout.write(f"\n💬 [{msg.author_name}]{badges}: {msg.text}")

            if dry_run:
                return

            # Build prompt for LLM
            language = character.response_language or "thai"
            language_instruction = (
                f"\n\n**สำคัญมาก: คุณต้องตอบกลับเป็นภาษา{language}เท่านั้น "
                f"อย่าตอบเป็นภาษาอื่น**"
            )

            system_prompt = character.system_prompt + language_instruction

            # Simple context: just the latest message
            messages = [
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": f"[{msg.author_name}]: {msg.text}",
                },
            ]

            try:
                response = llm.chat(messages)
                stats["replies_sent"] += 1
                self.stdout.write(self.style.SUCCESS(f"🤖 {character.name}: {response}"))
            except LLMServiceError as e:
                stats["errors"] += 1
                self.stderr.write(self.style.ERROR(f"LLM Error: {e}"))

        # Create and start service
        service = YouTubeLiveChatService(
            video_id=video_id,
            poll_interval=poll_interval,
        )
        service.on_message(on_message)

        # Handle Ctrl+C gracefully
        def signal_handler(sig, frame):
            self.stdout.write("\n\nShutting down...")
            service.stop()
            self.stdout.write(
                f"\n📊 Stats: {stats['messages_received']} messages, "
                f"{stats['replies_sent']} replies, {stats['errors']} errors"
            )
            sys.exit(0)

        signal.signal(signal.SIGINT, signal_handler)

        self.stdout.write("Starting YouTube live chat listener... (Ctrl+C to stop)")
        self.stdout.write("")

        service.start(blocking=True)
