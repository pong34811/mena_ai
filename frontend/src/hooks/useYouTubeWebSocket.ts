/**
 * useYouTubeWebSocket — connects to /ws/youtube-chat/ and pushes incoming
 * YouTube messages + AI replies through callbacks.
 *
 * Replaces the old 2-second polling loop in ChatPage.
 */
import { useRef, useEffect, useCallback } from 'react'

export interface YouTubeWSEvent {
  type: 'yt_connected' | 'yt_message' | 'yt_reply'
  id?: string
  author_name?: string
  text?: string
  is_mod?: boolean
  is_owner?: boolean
  is_super_chat?: boolean
  ai_responded?: boolean
  ai_response?: string
  received_at?: string
}

interface UseYouTubeWebSocketOptions {
  enabled: boolean
  onMessage?: (event: YouTubeWSEvent) => void
  onReply?: (event: YouTubeWSEvent) => void
  onConnected?: () => void
  onError?: (error: string) => void
}

export function useYouTubeWebSocket({
  enabled,
  onMessage,
  onReply,
  onConnected,
  onError,
}: UseYouTubeWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  // Stable callback refs so the effect doesn't re-run on every render
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage
  const onReplyRef = useRef(onReply)
  onReplyRef.current = onReply
  const onConnectedRef = useRef(onConnected)
  onConnectedRef.current = onConnected
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const connect = useCallback(() => {
    if (!mountedRef.current) return
    const existing = wsRef.current
    if (existing && existing.readyState !== WebSocket.CLOSED) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/youtube-chat/`)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) ws.close()
    }

    ws.onmessage = (event) => {
      if (!mountedRef.current) return
      try {
        const data: YouTubeWSEvent = JSON.parse(event.data)
        if (data.type === 'yt_connected') {
          onConnectedRef.current?.()
        } else if (data.type === 'yt_message') {
          onMessageRef.current?.(data)
        } else if (data.type === 'yt_reply') {
          onReplyRef.current?.(data)
        }
      } catch {
        // ignore malformed messages
      }
    }

    ws.onclose = () => {
      wsRef.current = null
      if (mountedRef.current && enabled) {
        reconnectRef.current = setTimeout(connect, 3000)
      }
    }

    ws.onerror = () => {
      onErrorRef.current?.('WebSocket error')
      if (ws.readyState === WebSocket.OPEN) ws.close()
    }
  }, [enabled])

  useEffect(() => {
    mountedRef.current = true
    if (enabled) connect()
    return () => {
      mountedRef.current = false
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) ws.close()
      wsRef.current = null
    }
  }, [enabled, connect])

  return {
    disconnect: () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) ws.close()
      wsRef.current = null
    },
  }
}
