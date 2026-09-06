import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { renderHook, cleanup } from '@testing-library/react'
import { useChatWebSocket } from './useChatWebSocket'

class MockWebSocket {
  static instances: MockWebSocket[] = []
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState: number = MockWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null

  constructor() {
    MockWebSocket.instances.push(this)
  }

  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  })

  send() {}
}

vi.stubGlobal('WebSocket', MockWebSocket)

beforeAll(() => {
  vi.useFakeTimers()
})

afterAll(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  MockWebSocket.instances = []
})

afterEach(() => {
  cleanup()
  vi.clearAllTimers()
})

describe('useChatWebSocket', () => {
  it('does not create a new socket after the hook unmounts', () => {
    const { unmount } = renderHook(() => useChatWebSocket())

    expect(MockWebSocket.instances.length).toBe(1)

    unmount()
    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    expect(MockWebSocket.instances.length).toBe(1)
  })

  it('does not close a connecting socket on unmount; closes it once it opens', () => {
    const { unmount } = renderHook(() => useChatWebSocket())
    const socket = MockWebSocket.instances[0]

    expect(socket.readyState).toBe(MockWebSocket.CONNECTING)
    unmount()

    expect(socket.close).not.toHaveBeenCalled()

    socket.onopen?.()
    expect(socket.close).toHaveBeenCalledTimes(1)
  })

  it('does not open a duplicate socket while one is still connecting (StrictMode double-mount)', () => {
    const { rerender } = renderHook(
      ({ onToken }) => useChatWebSocket({ onToken }),
      { initialProps: { onToken: () => {} } },
    )

    rerender({ onToken: () => {} })

    expect(MockWebSocket.instances.length).toBe(1)
  })
})