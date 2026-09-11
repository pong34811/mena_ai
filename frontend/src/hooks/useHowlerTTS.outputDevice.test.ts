import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { renderHook, cleanup, waitFor } from '@testing-library/react'
import { useHowlerTTS, type TTSSettings } from './useHowlerTTS'

const { generateMock, sinks, audioEls } = vi.hoisted(() => ({
  generateMock: vi.fn(),
  sinks: [] as string[],
  audioEls: [] as HTMLAudioElement[],
}))

vi.mock('@/services/api', () => ({
  ttsApi: { generate: generateMock },
  outputDeviceApi: {
    getCurrent: vi.fn(async () => ({ device: { device_id: 'cable-dev', name: 'Cable' } })),
    capture: vi.fn(async () => ({})),
  },
}))

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  // Define setSinkId on the prototype (absent in jsdom)
  Object.defineProperty(window.HTMLMediaElement.prototype, 'setSinkId', {
    configurable: true,
    writable: true,
    value: vi.fn(async function (this: HTMLMediaElement, id: string) {
      sinks.push(id)
    }),
  })
  // Stub play/pause on the prototype
  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    audioEls.push(this as HTMLAudioElement)
    queueMicrotask(() => {
      this.dispatchEvent(new Event('ended'))
    })
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
  sinks.length = 0
  audioEls.length = 0
  ;(window.HTMLMediaElement.prototype.setSinkId as any).mockClear()
  ;(window.HTMLMediaElement.prototype.play as any).mockClear()
  ;(window.HTMLMediaElement.prototype.pause as any).mockClear()
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
  it('auto-applies the device from output-devices/current on mount', async () => {
    const { result } = renderHook(() => useHowlerTTS())

    await waitFor(() => {
      expect(result.current.settings.output_device_id).toBe('cable-dev')
    })

    // The hook should have called setSinkId with the saved device
    expect(sinks).toContain('cable-dev')
  })

  it('applies the output device before each playback', async () => {
    const settings: TTSSettings = {
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

    const { result } = renderHook(() => useHowlerTTS(settings))

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
    // setSinkId should have been called with the device
    expect(sinks).toContain('cable-dev')
  })

  it('setOutputDevice captures to backend and applies locally', async () => {
    const { outputDeviceApi } = await import('@/services/api')
    const settings: TTSSettings = {
      questioner_enabled: false,
      questioner_voice: 'q-voice',
      questioner_rate: '+0%',
      questioner_say_username: true,
      responder_enabled: false,
      responder_voice: 'r-voice',
      responder_rate: '+0%',
      responder_delay_ms: 0,
      output_device_id: '',
    }

    const { result } = renderHook(() => useHowlerTTS(settings))

    await act(async () => {
      await result.current.setOutputDevice('new-dev', 'New Device')
    })

    expect(outputDeviceApi.capture).toHaveBeenCalledWith('new-dev', 'New Device', expect.any(String))
    expect(result.current.settings.output_device_id).toBe('new-dev')
    expect(sinks).toContain('new-dev')
  })
})