import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { renderHook, cleanup, waitFor } from '@testing-library/react'
import { useHowlerTTS } from './useHowlerTTS'

const { generateMock } = vi.hoisted(() => ({ generateMock: vi.fn() }))

vi.mock('@/services/api', () => ({
  ttsApi: { generate: generateMock },
  outputDeviceApi: {
    getCurrent: vi.fn(),
    capture: vi.fn(async () => ({})),
  },
}))

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperty(window.HTMLMediaElement.prototype, 'setSinkId', {
    configurable: true,
    writable: true,
    value: vi.fn(async () => {}),
  })
  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(function () {
    return Promise.resolve() as any
  })
  vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(function () {})
})

afterAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
  vi.restoreAllMocks()
})

beforeEach(() => {
  generateMock.mockClear()
  generateMock.mockResolvedValue(new Blob(['audio'], { type: 'audio/mpeg' }))
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

describe('useHowlerTTS settings loading', () => {
  it('loads settings and prefers the device from the output-devices current API', async () => {
    const { outputDeviceApi } = await import('@/services/api')
    ;(outputDeviceApi.getCurrent as any).mockResolvedValue({
      device: { device_id: 'current-dev', name: 'Current' },
    })

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/tts/settings/')) {
        return {
          ok: true,
          json: async () => ({
            questioner_enabled: false,
            questioner_voice: 'q-voice',
            questioner_rate: '+0%',
            questioner_say_username: true,
            responder_enabled: true,
            responder_voice: 'r-voice',
            responder_rate: '+0%',
            responder_delay_ms: 0,
            output_device_id: '',
          }),
        }
      }
      return { ok: false, json: async () => ({}) }
    }) as unknown as typeof fetch

    const { result } = renderHook(() => useHowlerTTS())

    await waitFor(() => {
      expect(result.current.settings.output_device_id).toBe('current-dev')
    })

    expect(outputDeviceApi.getCurrent).toHaveBeenCalled()
  })

  it('falls back to settings.output_device_id when current returns null', async () => {
    const { outputDeviceApi } = await import('@/services/api')
    ;(outputDeviceApi.getCurrent as any).mockResolvedValue({ device: null })

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/tts/settings/')) {
        return {
          ok: true,
          json: async () => ({
            questioner_enabled: false,
            questioner_voice: 'q-voice',
            questioner_rate: '+0%',
            questioner_say_username: true,
            responder_enabled: true,
            responder_voice: 'r-voice',
            responder_rate: '+0%',
            responder_delay_ms: 0,
            output_device_id: 'legacy-dev',
          }),
        }
      }
      return { ok: false, json: async () => ({}) }
    }) as unknown as typeof fetch

    const { result } = renderHook(() => useHowlerTTS())

    await waitFor(() => {
      expect(result.current.settings.output_device_id).toBe('legacy-dev')
    })
  })
})