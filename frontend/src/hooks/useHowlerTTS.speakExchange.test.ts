import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { renderHook, cleanup } from '@testing-library/react'
import { useHowlerTTS, type TTSSettings } from './useHowlerTTS'

// --- Mocks ---------------------------------------------------------------

const { generateMock } = vi.hoisted(() => ({ generateMock: vi.fn() }))

// Replace the network layer: TTS audio is "generated" locally instead of via the Django API.
vi.mock('@/services/api', () => ({
  ttsApi: { generate: generateMock },
}))

// Replace Howler so playback completes instantly without a real audio context.
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
      // Simulate a successful full playback that ends on the next microtask.
      queueMicrotask(() => {
        for (const cb of this.events.get('end') ?? []) cb(0)
      })
      return 0
    }

    stop() {
      // Skip is not exercised in these tests.
      return this
    }
  }

  return {
    Howl,
    Howler: { ctx: null },
  }
})

// --- Fixtures ------------------------------------------------------------

const enabledSettings: TTSSettings = {
  questioner_enabled: true,
  questioner_voice: 'q-voice',
  questioner_rate: '+0%',
  questioner_say_username: true,
  responder_enabled: true,
  responder_voice: 'r-voice',
  responder_rate: '+0%',
  responder_delay_ms: 0,
}

/** Wait until `predicate` is true, letting pending microtasks/zero-delay timers run. */
async function flush(predicate: () => boolean, timeoutMs = 3000) {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`flush(): condition not reached in time — got ${JSON.stringify(spokenTexts())}`)
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
  }
}

function speak(hook: { current: ReturnType<typeof useHowlerTTS> }, opts: {
  questioner_text: string
  questioner_author?: string
  responder_text?: string
  source_id: string
}) {
  hook.current.speakExchange({
    questioner_text: opts.questioner_text,
    questioner_author: opts.questioner_author,
    responder_text: opts.responder_text ?? '',
    source: 'youtube',
    source_id: opts.source_id,
  })
}

function spokenTexts(): string[] {
  return generateMock.mock.calls.map((call) => call[0] as string)
}

beforeAll(() => {
  // React 19 requires this flag for act() to flush async updates between awaits.
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
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

// --- Tests ---------------------------------------------------------------

describe('useHowlerTTS.speakExchange — fake YouTube poll flow', () => {
  it('speaks questioner (name, then message) and later AI reply exactly once, in order', async () => {
    const { result } = renderHook(() => useHowlerTTS(enabledSettings))

    // Poll 1: viewer message arrives, no AI reply yet.
    act(() => {
      speak(result, {
        questioner_text: 'Hello there',
        questioner_author: 'FanOne',
        source_id: 'yt-1',
      })
    })
    await flush(() => generateMock.mock.calls.length === 2)
    expect(spokenTexts()).toEqual(['FanOne', 'Hello there'])
    expect(generateMock.mock.calls.map((call) => call[1])).toEqual(['q-voice', 'q-voice'])

    // Poll 2: same message now has an AI reply -> only the responder is spoken.
    act(() => {
      speak(result, {
        questioner_text: 'Hello there',
        questioner_author: 'FanOne',
        responder_text: 'Hi, welcome to the stream!',
        source_id: 'yt-1',
      })
    })
    await flush(() => generateMock.mock.calls.length === 3)
    expect(spokenTexts()[2]).toBe('Hi, welcome to the stream!')
    expect(generateMock.mock.calls[2][1]).toBe('r-voice')

    // Poll 3/4: redundant re-polls of the same message must not re-speak anything.
    await act(async () => {
      speak(result, {
        questioner_text: 'Hello there',
        questioner_author: 'FanOne',
        responder_text: 'Hi, welcome to the stream!',
        source_id: 'yt-1',
      })
      speak(result, {
        questioner_text: 'Hello there',
        questioner_author: 'FanOne',
        source_id: 'yt-1',
      })
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    expect(generateMock.mock.calls.length).toBe(3)
  })

  it('serializes multiple viewers FIFO and dedupes each one across polls', async () => {
    const { result } = renderHook(() => useHowlerTTS(enabledSettings))

    // Two viewer messages arrive in the same poll batch (no replies yet).
    act(() => {
      speak(result, { questioner_text: 'First msg', questioner_author: 'ViewerA', source_id: 'yt-a' })
      speak(result, { questioner_text: 'Second msg', questioner_author: 'ViewerB', source_id: 'yt-b' })
    })
    await flush(() => generateMock.mock.calls.length === 4)
    expect(spokenTexts()).toEqual(['ViewerA', 'First msg', 'ViewerB', 'Second msg'])

    // A later poll returns the same two messages again — nothing new spoken.
    await act(async () => {
      speak(result, { questioner_text: 'First msg', questioner_author: 'ViewerA', source_id: 'yt-a' })
      speak(result, { questioner_text: 'Second msg', questioner_author: 'ViewerB', source_id: 'yt-b' })
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    expect(generateMock.mock.calls.length).toBe(4)

    // Replies eventually land for both messages; responder for each follows its viewer.
    act(() => {
      speak(result, {
        questioner_text: 'First msg',
        questioner_author: 'ViewerA',
        responder_text: 'Reply to A',
        source_id: 'yt-a',
      })
      speak(result, {
        questioner_text: 'Second msg',
        questioner_author: 'ViewerB',
        responder_text: 'Reply to B',
        source_id: 'yt-b',
      })
    })
    await flush(() => generateMock.mock.calls.length === 6)
    expect(spokenTexts()).toEqual([
      'ViewerA',
      'First msg',
      'ViewerB',
      'Second msg',
      'Reply to A',
      'Reply to B',
    ])
  })
})
