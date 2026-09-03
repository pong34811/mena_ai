"""
YouTube Live Chat Service - fetches live chat from YouTube and feeds to Characters.

Uses pytchat (not yt-dlp) because we need real-time streaming chat,
not a static file download.
"""

import logging
import time
import threading
from typing import Callable, Optional
from dataclasses import dataclass

# Monkey-patch pytchat to skip signal handler in non-main threads
# This is required because Django runs requests in worker threads
import pytchat.core.pytchat as pytchat_core
_original_init = pytchat_core.PytchatCore.__init__

def _patched_init(self, *args, **kwargs):
    # Skip signal handler if not in main thread
    if threading.current_thread() is not threading.main_thread():
        kwargs['interruptable'] = False
    _original_init(self, *args, **kwargs)

pytchat_core.PytchatCore.__init__ = _patched_init

import pytchat

logger = logging.getLogger(__name__)


@dataclass
class ChatMessage:
    """Represents a single YouTube live chat message."""
    message_id: str
    author_name: str
    author_channel_id: str
    text: str
    timestamp: float
    is_mod: bool = False
    is_owner: bool = False
    is_super_chat: bool = False


class YouTubeLiveChatService:
    """
    Service that connects to a YouTube live stream and streams chat messages.
    
    Usage:
        service = YouTubeLiveChatService(video_id="Af7pRKJYFE0")
        service.on_message(handle_message)
        service.start()  # blocks until stopped
    """

    def __init__(self, video_id: str, poll_interval: float = 1.0):
        """
        Args:
            video_id: YouTube video ID (e.g., "Af7pRKJYFE0")
            poll_interval: How often to poll for new messages (seconds)
        """
        self.video_id = video_id
        self.poll_interval = poll_interval
        self._message_callback: Optional[Callable[[ChatMessage], None]] = None
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._chat: Optional[pytchat.LiveChat] = None
        self._seen_ids: set = set()
        self._stop_event = threading.Event()

    def on_message(self, callback: Callable[[ChatMessage], None]):
        """Register a callback for new chat messages."""
        self._message_callback = callback
        return self

    def start(self, blocking: bool = True):
        """Start listening for chat messages."""
        if self._running:
            logger.warning("Service already running")
            return

        self._running = True
        self._stop_event.clear()
        self._seen_ids.clear()

        if blocking:
            self._run_loop()
        else:
            self._thread = threading.Thread(target=self._run_loop, daemon=True)
            self._thread.start()

    def stop(self):
        """Stop listening for chat messages."""
        self._running = False
        self._stop_event.set()
        if self._chat:
            try:
                self._chat.terminate()
            except Exception:
                pass
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5)

    def _run_loop(self):
        """Main loop that connects to YouTube and streams chat."""
        logger.info(f"Connecting to YouTube live chat for video: {self.video_id}")

        try:
            self._chat = pytchat.create(video_id=self.video_id)
        except Exception as e:
            logger.error(f"Failed to create pytchat: {e}")
            self._running = False
            return

        while self._running and not self._stop_event.is_set():
            if not self._chat.is_alive():
                logger.warning("Chat connection lost. Reconnecting in 5s...")
                time.sleep(5)
                try:
                    self._chat.terminate()
                except Exception:
                    pass
                try:
                    self._chat = pytchat.create(video_id=self.video_id)
                except Exception as e:
                    logger.error(f"Reconnection failed: {e}")
                    continue

            try:
                data = self._chat.get()
                if data:
                    for item in data.sync_items():
                        msg = ChatMessage(
                            message_id=item.id,
                            author_name=item.author.name,
                            author_channel_id=item.author.channelId,
                            text=item.message,
                            timestamp=time.time(),
                            is_mod=item.author.type == "moderator",
                            is_owner=item.author.type == "owner",
                            is_super_chat=item.amountString is not None,
                        )
                        # Deduplicate
                        if msg.message_id not in self._seen_ids:
                            self._seen_ids.add(msg.message_id)
                            # Keep set bounded
                            if len(self._seen_ids) > 10000:
                                self._seen_ids = set(list(self._seen_ids)[-5000:])
                            if self._message_callback:
                                try:
                                    self._message_callback(msg)
                                except Exception as e:
                                    logger.error(f"Message callback error: {e}")
            except Exception as e:
                logger.error(f"Error processing chat data: {e}")

            self._stop_event.wait(self.poll_interval)

        self._running = False
        try:
            self._chat.terminate()
        except Exception:
            pass
        logger.info("YouTube live chat service stopped")
