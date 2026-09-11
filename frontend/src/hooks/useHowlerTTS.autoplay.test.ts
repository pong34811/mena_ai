import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { renderHook, cleanup, waitFor } from '@testing-library/react'
import { useHowlerTTS, type TTSSettings } from './useHowlerTTS'

const { generateMock, audioEls } = vi.hoisted(() => ({
  generateMock: vi.fn(),
  audioEls: [] as HTMLAudioElement[],
}))

vi.mock('@/services/api', () => ({
  ttsApi: { generate: generateMock },
  outputDeviceApi: {
    getCurrent: vi.fn(async () => ({ device: null })),
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
  audioEls.length = 0
  ;(window.HTMLMediaElement.prototype.play as any).mockClear()
  ;(window.HTMLMediaElement.prototype.pause as any).mockClear()
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
  it('plays audio to completion via <audio> element', async () => {
    const enabledSettings: TTSSettings = {
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
    // play() was called on the audio element
    expect(audioEls.length).toBeGreaterThanOrEqual(1)
  })
})