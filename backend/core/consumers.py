"""
WebSocket consumer for streaming chat tokens — Proof-of-concept.
"""
import json
import logging
import uuid
import threading
import queue

from channels.generic.websocket import AsyncWebsocketConsumer

logger = logging.getLogger(__name__)


class ChatStreamConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer that streams LLM tokens to the client.

    Protocol:
    Client -> Server: {"type": "chat", "character_id": "...", "message": "...", "user_name": "..."}
    Server -> Client: {"type": "token", "content": "..."}
    Server -> Client: {"type": "done", "message_id": "..."}
    Server -> Client: {"type": "error", "error": "..."}
    """

    async def connect(self):
        await self.accept()
        logger.info("WebSocket client connected")
        await self.send(text_data=json.dumps({"type": "connected"}))

    async def disconnect(self, close_code):
        logger.info(f"WebSocket client disconnected: {close_code}")

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({
                "type": "error",
                "error": "Invalid JSON"
            }))
            return

        msg_type = data.get("type")
        if msg_type == "chat":
            await self.handle_chat(data)
        else:
            await self.send(text_data=json.dumps({
                "type": "error",
                "error": f"Unknown message type: {msg_type}"
            }))

    async def handle_chat(self, data: dict):
        """Handle a chat message by streaming tokens from the LLM."""
        character_id = data.get("character_id", "")
        message = data.get("message", "")
        user_name = data.get("user_name", "")

        if not character_id or not message:
            await self.send(text_data=json.dumps({
                "type": "error",
                "error": "character_id and message are required"
            }))
            return

        # Validate UUID format early
        try:
            uuid.UUID(character_id)
        except ValueError:
            await self.send(text_data=json.dumps({
                "type": "error",
                "error": "Invalid character_id format (must be UUID)"
            }))
            return

        import asyncio
        from asgiref.sync import sync_to_async
        from core.services import LLMService, LLMServiceError

        try:
            from core.models import Character
            from chat_messages.models import ChatMessage
            from django.utils import timezone
            from datetime import timedelta

            try:
                character = await sync_to_async(Character.objects.get)(id=character_id)
            except Character.DoesNotExist:
                await self.send(text_data=json.dumps({
                    "type": "error",
                    "error": "Character not found"
                }))
                return

            # Build history
            since = timezone.now() - timedelta(days=character.memory_duration_days)
            history_qs = ChatMessage.objects.filter(
                character=character,
                created_at__gte=since,
            )
            if user_name and character.enable_per_user_memory:
                history_qs = history_qs.filter(user_name=user_name)

            history = await sync_to_async(list)(
                history_qs.order_by('-created_at').values('role', 'content')[:20]
            )

            # Build system prompt
            system_prompt = character.build_system_prompt()

            messages_list = [{'role': 'system', 'content': system_prompt}]
            messages_list += [{'role': h['role'], 'content': h['content']} for h in reversed(history)]
            messages_list.append({'role': 'user', 'content': message})

            # Use a threading.Queue to bridge sync LLM streaming to async WebSocket
            token_queue = queue.Queue()
            SENTINEL = object()
            llm = LLMService()
            max_tokens = character.get_max_tokens()

            def _stream_blocking():
                """Blocking function that streams LLM tokens into the queue."""
                import requests

                payload = {
                    'model': llm.get_auto_model(),
                    'messages': messages_list,
                    'temperature': llm.temperature,
                    'max_tokens': max_tokens,
                    'stream': True,
                }
                headers = {'Content-Type': 'application/json'}
                if llm.api_key:
                    headers['X-API-Key'] = llm.api_key

                try:
                    session = requests.Session()
                    response = session.post(
                        llm.api_url,
                        json=payload,
                        headers=headers,
                        stream=True,
                        timeout=(10, 120),
                    )
                    response.raise_for_status()

                    for line in response.iter_lines():
                        if line:
                            decoded = line.decode('utf-8')
                            if decoded.startswith('data: '):
                                chunk_data = decoded[6:]
                                if chunk_data.strip() == '[DONE]':
                                    break
                                try:
                                    chunk = json.loads(chunk_data)
                                    choices = chunk.get('choices', [])
                                    if choices:
                                        delta = choices[0].get('delta', {})
                                        # Put content into queue (including empty strings)
                                        # to keep the queue flowing — we filter client-side
                                        content = delta.get('content', '') or ''
                                        token_queue.put(content)
                                except json.JSONDecodeError:
                                    continue
                except Exception as e:
                    token_queue.put(e)
                finally:
                    token_queue.put(SENTINEL)

            # Start the blocking stream in a thread
            stream_thread = threading.Thread(target=_stream_blocking, daemon=True)
            stream_thread.start()

            # Read tokens from queue and send to client.
            # Length budget is enforced live: once the reply exceeds the
            # character's response_length budget we stop forwarding tokens
            # (the saved reply is truncated to the same budget below).
            full_text = ""
            try:
                while True:
                    try:
                        # Block until a token lands; the 300s wait_for is the stall guard.
                        token = await asyncio.wait_for(
                            sync_to_async(token_queue.get, thread_sensitive=False)(),
                            timeout=300
                        )
                        if token is SENTINEL:
                            break
                        if isinstance(token, Exception):
                            raise token
                        full_text += token
                        if character.is_over_budget(full_text):
                            logger.info("Stream cut off at length budget")
                            break
                        await self.send(text_data=json.dumps({
                            "type": "token",
                            "content": token,
                        }))
                    except asyncio.TimeoutError:
                        logger.warning("Token queue timeout - stream may be stuck")
                        break
            except Exception:
                raise

            # Server-side enforcement: length truncation + language repair, so
            # the saved reply always honors response_language/response_length
            # even when the streamed tokens did not.
            final_text = character.enforce_response_length(full_text)
            if final_text and not character.matches_language(final_text):
                logger.warning("Streamed reply not in '%s', repairing", character.response_language)
                try:
                    repaired = await sync_to_async(llm.repair_language)(
                        character, messages_list, full_text
                    )
                    final_text = character.enforce_response_length(repaired)
                except Exception as e:
                    logger.warning(f"Stream language repair failed: {e}")
            # Save messages to DB (assistant content = enforced final text)
            await sync_to_async(ChatMessage.objects.create)(
                character=character,
                role=ChatMessage.Role.USER,
                content=message[:2000],
                user_name=user_name[:100],
            )
            assistant_msg = await sync_to_async(ChatMessage.objects.create)(
                character=character,
                role=ChatMessage.Role.ASSISTANT,
                content=final_text[:4000],
                user_name=user_name[:100],
            )

            await self.send(text_data=json.dumps({
                "type": "done",
                "message_id": str(assistant_msg.id),
                "content": final_text,
            }))

        except LLMServiceError as e:
            await self.send(text_data=json.dumps({
                "type": "error",
                "error": str(e)
            }))
        except Exception as e:
            logger.exception("Unexpected error in chat handler")
            await self.send(text_data=json.dumps({
                "type": "error",
                "error": f"Internal error: {str(e)}"
            }))