import { useRef, useCallback, useEffect } from 'react'

interface UseChatWebSocketOptions {
  onToken?: (token: string) => void
  onDone?: (messageId: string, content?: string) => void
  onError?: (error: string) => void
}

export function useChatWebSocket({ onToken, onDone, onError }: UseChatWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isUnmountedRef = useRef(false)

  // Keep the latest callbacks in refs so the effect never re-runs (and the
  // socket never reconnects) just because a parent re-rendered with new
  // inline callbacks.
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const connect = useCallback(() => {
    if (isUnmountedRef.current) return
    const existing = wsRef.current
    if (existing && existing.readyState !== WebSocket.CLOSED) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/chat/`)
    wsRef.current = ws

    ws.onopen = () => {
      if (isUnmountedRef.current) ws.close()
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'token') onTokenRef.current?.(msg.content)
        else if (msg.type === 'done') onDoneRef.current?.(msg.message_id, msg.content)
        else if (msg.type === 'error') onErrorRef.current?.(msg.error)
      } catch {}
    }

    ws.onclose = () => {
      wsRef.current = null
      if (!isUnmountedRef.current) {
        reconnectTimeoutRef.current = setTimeout(connect, 3000)
      }
    }

    ws.onerror = () => {
      if (ws.readyState === WebSocket.OPEN) ws.close()
    }
  }, [])

  useEffect(() => {
    isUnmountedRef.current = false
    connect()
    return () => {
      isUnmountedRef.current = true
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) ws.close()
      wsRef.current = null
    }
  }, [connect])

  const sendChat = useCallback((characterId: string, message: string, userName: string) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return false
    wsRef.current.send(JSON.stringify({ type: 'chat', character_id: characterId, message, user_name: userName }))
    return true
  }, [])

  return { sendChat }
}
