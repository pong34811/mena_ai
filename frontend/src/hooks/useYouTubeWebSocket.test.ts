import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useYouTubeWebSocket } from './useYouTubeWebSocket'

class MockWebSocket {
  static instances: MockWebSocket[] = []
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState: number = MockWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onclose: ((e: { code: number; reason: string }) => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null

  constructor() {
    MockWebSocket.instances.push(this)
  }

  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({ code: 1000, reason: '' })
  })

  send() {}
}

vi.stubGlobal('WebSocket', MockWebSocket)

beforeEach(() => {
  MockWebSocket.instances = []
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('useYouTubeWebSocket', () => {
  it('does not connect when disabled', () => {
    renderHook(() => useYouTubeWebSocket({ enabled: false }))
    expect(MockWebSocket.instances.length).toBe(0)
  })

  it('connects when enabled', () => {
    renderHook(() => useYouTubeWebSocket({ enabled: true }))
    expect(MockWebSocket.instances.length).toBe(1)
  })

  it('does not create duplicate sockets on re-render', () => {
    const { rerender } = renderHook(
      ({ enabled }) => useYouTubeWebSocket({ enabled }),
      { initialProps: { enabled: true } }
    )
    rerender({ enabled: true })
    expect(MockWebSocket.instances.length).toBe(1)
  })

  it('fires onConnected when yt_connected message is received', () => {
    const onConnected = vi.fn()
    renderHook(() => useYouTubeWebSocket({ enabled: true, onConnected }))
    const socket = MockWebSocket.instances[0]
    socket.onopen?.()
    socket.onmessage?.({
      data: JSON.stringify({
        type: 'yt_connected',
      }),
    })
    expect(onConnected).toHaveBeenCalledTimes(1)
  })

  it('fires onMessage for yt_message events', () => {
    const onMessage = vi.fn()
    renderHook(() => useYouTubeWebSocket({ enabled: true, onMessage }))
    const socket = MockWebSocket.instances[0]
    socket.onopen?.()
    socket.onmessage?.({
      data: JSON.stringify({
        type: 'yt_message',
        id: 'msg-1',
        author_name: 'Viewer',
        text: 'Hello!',
      }),
    })
    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'yt_message',
        id: 'msg-1',
        author_name: 'Viewer',
        text: 'Hello!',
      })
    )
  })

  it('fires onReply for yt_reply events', () => {
    const onReply = vi.fn()
    renderHook(() => useYouTubeWebSocket({ enabled: true, onReply }))
    const socket = MockWebSocket.instances[0]
    socket.onopen?.()
    socket.onmessage?.({
      data: JSON.stringify({
        type: 'yt_reply',
        id: 'msg-1',
        ai_response: 'Hi there!',
      }),
    })
    expect(onReply).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'yt_reply',
        id: 'msg-1',
        ai_response: 'Hi there!',
      })
    )
  })

  it('fires onError for yt_error events', () => {
    const onError = vi.fn()
    renderHook(() => useYouTubeWebSocket({ enabled: true, onError }))
    const socket = MockWebSocket.instances[0]
    socket.onopen?.()
    socket.onerror?.()
    expect(onError).toHaveBeenCalledWith('WebSocket error')
  })

  it('does not schedule reconnect when enabled is false on close', () => {
    const { rerender } = renderHook(
      ({ enabled }) => useYouTubeWebSocket({ enabled }),
      { initialProps: { enabled: true } }
    )
    rerender({ enabled: false })
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(MockWebSocket.instances.length).toBe(1)
  })

  it('closes socket on unmount only when open', () => {
    const { unmount } = renderHook(() => useYouTubeWebSocket({ enabled: true }))
    const socket = MockWebSocket.instances[0]
    expect(socket.readyState).toBe(MockWebSocket.CONNECTING)
    unmount()
    expect(socket.close).not.toHaveBeenCalled()
    socket.onopen?.()
    expect(socket.close).toHaveBeenCalledTimes(1)
  })

  it('ignores malformed JSON messages', () => {
    const onMessage = vi.fn()
    const onReply = vi.fn()
    renderHook(() => useYouTubeWebSocket({ enabled: true, onMessage, onReply }))
    const socket = MockWebSocket.instances[0]
    socket.onopen?.()
    socket.onmessage?.({ data: 'not valid json' })
    expect(onMessage).not.toHaveBeenCalled()
    expect(onReply).not.toHaveBeenCalled()
  })
})
