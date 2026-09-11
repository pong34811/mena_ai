import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { renderHook, cleanup, waitFor } from '@testing-library/react'
import { useHowlerTTS } from './useHowlerTTS'

const { generateMock, ctx } = vi.hoisted(() => ({
  generateMock: vi.fn(),
  ctx: {
    state: 'suspended',
    destination: {},
    resume: vi.fn(async () => {}),
    createBuffer: () => ({}),
    createBufferSource: () => ({ buffer: null, connect: () => {}, start: () => {} }),
  },
}))

vi.mock('@/services/api', () => ({
  ttsApi: { generate: generateMock },
}))

vi.mock('howler', () => {
  class Howl {
    once() {
      return this
    }
    play() {
      return 0
    }
    stop() {
      return this
    }
  }
  return { Howl, Howler: { ctx } }
})

const settingsResponse = {
  questioner_enabled: false,
  questioner_voice: 'q-voice',
  questioner_rate: '+0%',
  questioner_say_username: true,
  responder_enabled: true,
  responder_voice: 'r-voice',
  responder_rate: '+0%',
  responder_delay_ms: 0,
  output_device_id: '',
}

const fetchCalls: string[] = []

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

beforeEach(() => {
  fetchCalls.length = 0
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    fetchCalls.push(url)
    if (url.includes('/api/tts/settings/')) {
      return { ok: true, json: async () => settingsResponse }
    }
    if (url.includes('/api/output-devices/current/')) {
      return { ok: true, json: async () => ({ device: { device_id: 'current-dev', name: 'Current' } }) }
    }
    return { ok: false, json: async () => ({}) }
  }) as unknown as typeof fetch
  ctx.state = 'suspended'
  ctx.resume.mockClear()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('useHowlerTTS settings loading', () => {
  it('loads settings and prefers the device from the output-devices current API', async () => {
    const { result } = renderHook(() => useHowlerTTS())

    await waitFor(() => {
      expect(result.current.settings.output_device_id).toBe('current-dev')
    })

    expect(fetchCalls).toContain('/api/tts/settings/')
    expect(fetchCalls).toContain('/api/output-devices/current/')
  })

  it('falls back to settings.output_device_id when current returns null', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/tts/settings/')) {
        return { ok: true, json: async () => ({ ...settingsResponse, output_device_id: 'legacy-dev' }) }
      }
      if (url.includes('/api/output-devices/current/')) {
        return { ok: true, json: async () => ({ device: null }) }
      }
      return { ok: false, json: async () => ({}) }
    }) as unknown as typeof fetch

    const { result } = renderHook(() => useHowlerTTS())

    await waitFor(() => {
      expect(result.current.settings.output_device_id).toBe('legacy-dev')
    })
  })
})