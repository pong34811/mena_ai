import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { renderHook, cleanup, waitFor } from '@testing-library/react'
import { useHowlerTTS, type TTSSettings } from './useHowlerTTS'

const { generateMock, playState, ctx } = vi.hoisted(() => {
  const ctx = {
    state: 'suspended',
    destination: {},
    resume: vi.fn(async () => {
      ctx.state = 'running'
    }),
    createBuffer: () => ({}),
    createBufferSource: () => ({ buffer: null, connect: () => {}, start: () => {} }),
  }
  return { generateMock: vi.fn(), playState: { totalPlays: 0 }, ctx }
})

vi.mock('@/services/api', () => ({
  ttsApi: { generate: generateMock },
}))

// First play() is autoplay-blocked (fires playerror); a retry plays to completion.
vi.mock('howler', () => {
  class Howl {
    private events = new Map<string, Array<(...args: unknown[]) => void>>()

    once(event: string, cb: (...args: unknown[]) => void) {
      const list = this.events.get(event) ?? []
      list.push(cb)
      this.events.set(event, list)
      return this
    }

    play() {
      playState.totalPlays += 1
      if (playState.totalPlays === 1) {
        for (const cb of this.events.get('playerror') ?? []) cb(new Error('autoplay blocked'))
      } else {
        queueMicrotask(() => {
          for (const cb of this.events.get('end') ?? []) cb(0)
        })
      }
      return 0
    }

    stop() {
      return this
    }
  }

  return { Howl, Howler: { ctx } }
})

const enabledSettings: TTSSettings = {
  questioner_enabled: false,
  questioner_voice: 'q-voice',
  questioner_rate: '+0%',
  questioner_say_username: true,
  responder_enabled: true,
  responder_voice: 'r-voice',
  responder_rate: '+0%',
  responder_delay_ms: 0,
}

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

beforeEach(() => {
  generateMock.mockClear()
  generateMock.mockResolvedValue(new Blob(['audio'], { type: 'audio/mpeg' }))
  ctx.state = 'suspended'
  ctx.resume.mockClear()
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:mock'),
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('useHowlerTTS autoplay retry', () => {
  it('resumes the audio context and replays when the first play is blocked', async () => {
    const { result } = renderHook(() => useHowlerTTS(enabledSettings))

    act(() => {
      result.current.speakExchange({
        questioner_text: '',
        responder_text: 'สวัสดีครับ',
        source: 'test',
        source_id: 'rt-1',
      })
    })

    await waitFor(() => expect(result.current.isPlaying).toBe(false))
    expect(generateMock).toHaveBeenCalledTimes(1)
    expect(playState.totalPlays).toBe(2)
    expect(ctx.resume).toHaveBeenCalled()
  })
})