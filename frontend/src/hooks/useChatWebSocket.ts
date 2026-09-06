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

  const connect = useCallback(() => {
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
        if (msg.type === 'token') onToken?.(msg.content)
        else if (msg.type === 'done') onDone?.(msg.message_id, msg.content)
        else if (msg.type === 'error') onError?.(msg.error)
      } catch {}
    }

    ws.onclose = () => {
      if (!isUnmountedRef.current) {
        reconnectTimeoutRef.current = setTimeout(connect, 3000)
      }
    }

    ws.onerror = () => {
      if (ws.readyState === WebSocket.OPEN) ws.close()
    }
  }, [onToken, onDone, onError])

  useEffect(() => {
    isUnmountedRef.current = false
    connect()
    return () => {
      isUnmountedRef.current = true
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) ws.close()
    }
  }, [connect])

  const sendChat = useCallback((characterId: string, message: string, userName: string) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return false
    wsRef.current.send(JSON.stringify({ type: 'chat', character_id: characterId, message, user_name: userName }))
    return true
  }, [])

  return { sendChat }
}
