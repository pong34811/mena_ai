import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { renderHook, cleanup, waitFor } from '@testing-library/react'
import { useHowlerTTS, type TTSSettings } from './useHowlerTTS'

// Chromium-variant model for AudioContext sink routing:
// - ctx.resume() needs a user gesture (resumeAllowed).
// - ctx.setSinkId() is permissive (resolves even while suspended — variant B
//   where a mount-time call "succeeds" without routing) but only ACTUALLY
//   routes audio when the context is running. `runningApplies` records the
//   only state in which routing is real.
const { generateMock, setResumeAllowed, runningApplies, ctx } = vi.hoisted(() => {
  let resumeAllowed = false
  let appliedWhileRunning = 0
  const ctx = {
    state: 'suspended',
    destination: {},
    resume: vi.fn(async () => {
      if (!resumeAllowed) throw new Error('NotAllowedError')
      ctx.state = 'running'
    }),
    setSinkId: vi.fn(async () => {
      if (ctx.state === 'running') appliedWhileRunning += 1
    }),
    createBuffer: () => ({}) as AudioBuffer,
    createBufferSource: () => ({ buffer: null, connect: () => {}, start: () => {} }),
  }
  return {
    generateMock: vi.fn(),
    setResumeAllowed: (v: boolean) => {
      resumeAllowed = v
    },
    runningApplies: () => appliedWhileRunning,
    ctx,
  }
})

vi.mock('@/services/api', () => ({
  ttsApi: { generate: generateMock },
}))

vi.mock('howler', () => {
  class Howl {
    private events = new Map<string, Array<(...args: unknown[]) => void>>()
    private totalPlays = 0

    once(event: string, cb: (...args: unknown[]) => void) {
      const list = this.events.get(event) ?? []
      list.push(cb)
      this.events.set(event, list)
      return this
    }

    play() {
      this.totalPlays += 1
      if (this.totalPlays === 1) {
        // First play is autoplay-blocked. The browser grants the unlock retry,
        // which is what makes the follow-up ctx.resume() succeed.
        setResumeAllowed(true)
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

const deviceSettings: TTSSettings = {
  questioner_enabled: false,
  questioner_voice: 'q-voice',
  questioner_rate: '+0%',
  questioner_say_username: true,
  responder_enabled: true,
  responder_voice: 'r-voice',
  responder_rate: '+0%',
  responder_delay_ms: 0,
  output_device_id: 'cable-dev',
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
  ctx.setSinkId.mockClear()
  setResumeAllowed(false)
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

describe('useHowlerTTS output device routing', () => {
  it('does not let a mount-time apply (suspended, no gesture) swallow the later gesture-time apply', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/tts/settings/')) {
        return { ok: true, json: async () => ({ ...deviceSettings }) }
      }
      if (url.includes('/api/output-devices/current/')) {
        return { ok: true, json: async () => ({ device: { device_id: 'cable-dev', name: 'Cable' } }) }
      }
      return { ok: false, json: async () => ({}) }
    }) as unknown as typeof fetch

    const { result } = renderHook(() => useHowlerTTS())

    await waitFor(() => {
      expect(result.current.settings.output_device_id).toBe('cable-dev')
    })

    // Flush the deferred mount apply (suspended, no user gesture): it must not
    // stick a cache entry that would suppress the real apply later.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
    expect(runningApplies()).toBe(0)

    // Now the user gesture: unlocking audio must route to the saved device.
    setResumeAllowed(true)
    await act(async () => {
      await result.current.unlockAudio()
    })
    expect(runningApplies()).toBeGreaterThanOrEqual(1)
  })

  it('re-applies the output device after the autoplay-unlock resume so the sound routes', async () => {
    const { result } = renderHook(() => useHowlerTTS(deviceSettings))

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
    // The sink must have been applied at least once while the context was
    // actually running (after resume) — the pre-unlock applies are no-ops.
    expect(runningApplies()).toBeGreaterThanOrEqual(1)
  })
})