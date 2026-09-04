/**
 * useHowlerTTS — client-side TTS playback using Howler.js
 *
 * Replaces useTTSQueue with a simpler client-side approach:
 * - Generates TTS audio via the Django API (same as before)
 * - Plays audio immediately using Howler.js
 * - No server-side queue polling needed
 * - Supports questioner (username + text with delay) and responder (text only)
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { Howl, Howler } from 'howler'
import { ttsApi } from '@/services/api'

export interface TTSSettings {
  questioner_enabled: boolean
  questioner_voice: string
  questioner_rate: string
  questioner_say_username: boolean
  responder_enabled: boolean
  responder_voice: string
  responder_rate: string
  responder_delay_ms: number
}

export interface TTSQueueItem {
  id: string
  type: 'questioner' | 'responder'
  text: string
  voice: string
  rate: string
  author_name: string
  say_username: boolean
  source: string
}

export interface SpeakExchangeOptions {
  /** Text of the message the questioner (sender/viewer) wrote. */
  questioner_text: string
  /** Name of the questioner (spoken first when say_username is on). */
  questioner_author?: string
  /** Text of the AI (responder) reply. */
  responder_text: string
  /** e.g. 'youtube', 'chat', 'manual' */
  source?: string
  /** Unique id of the source message, used to avoid speaking it twice. */
  source_id?: string
}

interface HowlerTTSState {
  isPlaying: boolean
  currentItem: TTSQueueItem | null
  settings: TTSSettings
}

const defaultSettings: TTSSettings = {
  questioner_enabled: false,
  questioner_voice: 'th-TH-PremwadeeNeural',
  questioner_rate: '1.0',
  questioner_say_username: true,
  responder_enabled: false,
  responder_voice: 'th-TH-PremwadeeNeural',
  responder_rate: '1.0',
  responder_delay_ms: 3000,
}

export function useHowlerTTS(initialSettings?: TTSSettings) {
  const [state, setState] = useState<HowlerTTSState>({
    isPlaying: false,
    currentItem: null,
    settings: initialSettings || defaultSettings,
  })

  // Keep the latest values reachable from stable callbacks
  const settingsRef = useRef<TTSSettings>(state.settings)
  settingsRef.current = state.settings
  const currentItemRef = useRef<TTSQueueItem | null>(state.currentItem)
  currentItemRef.current = state.currentItem
  const activeHowlRef = useRef<Howl | null>(null)

  // Client-side speak queue (FIFO, mirrors the old server-side pair queue)
  const pendingRef = useRef<TTSQueueItem[]>([])
  const drainingRef = useRef(false)
  // Items already spoken, keyed by source so late AI replies aren't repeated
  const spokenRef = useRef<Set<string>>(new Set())
  // Cancellable questioner pause (between username and message)
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pauseResolveRef = useRef<(() => void) | null>(null)

  // Load settings on mount if not provided, and stop audio on unmount
  useEffect(() => {
    if (!initialSettings) {
      loadSettings().catch(console.error)
    }
    return () => {
      activeHowlRef.current?.stop()
      activeHowlRef.current = null
    }
  }, [initialSettings])

  const loadSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/tts/settings/')
      if (response.ok) {
        const data = await response.json()
        setState((prev) => ({ ...prev, settings: data }))
        settingsRef.current = data
      }
    } catch (err) {
      console.error('Failed to load TTS settings:', err)
    }
  }, [])

  const cancelPause = useCallback(() => {
    if (pauseTimerRef.current !== null) {
      clearTimeout(pauseTimerRef.current)
      pauseTimerRef.current = null
    }
    pauseResolveRef.current?.()
    pauseResolveRef.current = null
  }, [])

  const stopActive = useCallback(() => {
    cancelPause()
    activeHowlRef.current?.stop()
    activeHowlRef.current = null
  }, [cancelPause])

  // Play a single piece of audio, resolving when it finishes (or is stopped)
  const playSubItem = useCallback(async (text: string, voice: string, rate: string) => {
    try {
      const blob = await ttsApi.generate(text, voice, rate)
      if (!blob) return

      const url = URL.createObjectURL(blob)
      const sound = new Howl({
        src: [url],
        format: ['mp3'],
        volume: 1.0,
      })

      // Only one sound plays at a time — stop anything still active
      stopActive()
      activeHowlRef.current = sound

      await new Promise<void>((resolve) => {
        sound.once('end', () => resolve())
        sound.once('stop', () => resolve())
        sound.once('loaderror', () => {
          console.error('Howler load error')
          resolve()
        })
        sound.once('playerror', () => {
          console.error('Howler play error')
          resolve()
        })
        sound.play()
      })

      URL.revokeObjectURL(url)
      if (activeHowlRef.current === sound) {
        activeHowlRef.current = null
      }
    } catch (err) {
      console.error('Sub-item TTS error:', err)
    }
  }, [stopActive])

  // Register the active item synchronously (not just via state, which only
  // commits on re-render) so queue guards never read a stale item mid-flow.
  const setCurrent = useCallback((item: TTSQueueItem | null, isPlaying = false) => {
    currentItemRef.current = item
    setState((prev) => ({ ...prev, isPlaying, currentItem: item }))
  }, [])

  // Play a questioner item: author name, short pause, then the message text
  const playQuestionerItem = useCallback(async (item: TTSQueueItem) => {
    // Register as the active item so `skip` / a newer item can cancel the flow
    setCurrent(item, true)

    const isActive = () => currentItemRef.current?.id === item.id

    try {
      if (item.say_username && item.author_name) {
        await playSubItem(item.author_name, item.voice, item.rate)
        if (!isActive()) return
        const delayMs = settingsRef.current?.responder_delay_ms ?? 3000
        await new Promise<void>((resolve) => {
          pauseResolveRef.current = resolve
          pauseTimerRef.current = setTimeout(() => {
            pauseTimerRef.current = null
            pauseResolveRef.current = null
            resolve()
          }, delayMs)
        })
        if (!isActive()) return
      }
      await playSubItem(item.text, item.voice, item.rate)
    } finally {
      if (isActive()) {
        setCurrent(null)
      }
    }
  }, [playSubItem, setCurrent])

  // Play a responder item (text only), waiting until it completes
  const playItem = useCallback(async (item: TTSQueueItem) => {
    setCurrent(item, true)
    await playSubItem(item.text, item.voice, item.rate)
    if (currentItemRef.current?.id === item.id) {
      setCurrent(null)
    }
  }, [playSubItem, setCurrent])

  // Serialized playback — speak queued items one at a time, in order
  const drain = useCallback(async () => {
    if (drainingRef.current) return
    drainingRef.current = true
    try {
      while (pendingRef.current.length > 0) {
        const item = pendingRef.current.shift()
        if (!item) break
        if (item.type === 'questioner') {
          await playQuestionerItem(item)
        } else {
          await playItem(item)
        }
      }
    } finally {
      drainingRef.current = false
    }
  }, [playItem, playQuestionerItem])

  // Speak one questioner → responder exchange.
  // Mirrors the backend's enqueue_pair: gates on the live TTS settings and
  // queues questioner before responder so both play in the correct order.
  const speakExchange = useCallback((opts: SpeakExchangeOptions) => {
    const settings = settingsRef.current
    if (!settings) return

    const source = opts.source || ''
    const sourceId = opts.source_id || ''

    const enqueue = (item: TTSQueueItem, spokenKey: string) => {
      if (!item.text?.trim()) return
      if (spokenRef.current.has(spokenKey)) return
      spokenRef.current.add(spokenKey)
      pendingRef.current.push(item)
    }

    if (settings.questioner_enabled && opts.questioner_text?.trim()) {
      enqueue({
        id: `q-${source}-${sourceId || opts.questioner_text.slice(0, 40)}`,
        type: 'questioner',
        text: opts.questioner_text.slice(0, 500),
        voice: settings.questioner_voice,
        rate: settings.questioner_rate,
        author_name: (opts.questioner_author || '').slice(0, 100),
        say_username: settings.questioner_say_username,
        source,
      }, `q:${source}:${sourceId || opts.questioner_text}`)
    }

    if (settings.responder_enabled && opts.responder_text?.trim()) {
      enqueue({
        id: `r-${source}-${sourceId || opts.responder_text.slice(0, 40)}`,
        type: 'responder',
        text: opts.responder_text.slice(0, 500),
        voice: settings.responder_voice,
        rate: settings.responder_rate,
        author_name: '',
        say_username: false,
        source,
      }, `r:${source}:${sourceId || opts.responder_text}`)
    }

    void drain()
  }, [drain])

  // Skip current playback (queue continues with the next item)
  const skip = useCallback(() => {
    stopActive()
    setCurrent(null)
  }, [stopActive, setCurrent])

  const clearQueue = useCallback(() => {
    stopActive()
    pendingRef.current = []
    setCurrent(null)
  }, [stopActive, setCurrent])

  const resumeAudio = useCallback(() => {
    setState((prev) => ({ ...prev, isPlaying: false }))
  }, [])

  // Resume Howler's shared Web Audio context and prime it with a silent buffer.
  // Call from a user gesture (e.g. enabling TTS) to satisfy autoplay policies.
  const unlockAudio = useCallback(async () => {
    try {
      const ctx = Howler.ctx as AudioContext | null
      if (!ctx) return
      if (ctx.state === 'suspended') {
        await ctx.resume()
      }
      // Play a silent buffer so the context starts outputting immediately
      const buffer = ctx.createBuffer(1, 1, 22050)
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      source.start(0)
    } catch (err) {
      // AudioContext unavailable or resume rejected — audio will unlock on the next user gesture
      console.error('Audio unlock failed:', err)
    }
  }, [])

  return {
    ...state,
    settings: state.settings,
    reloadSettings: loadSettings,
    clearQueue,
    skip,
    resumeAudio,
    unlockAudio,
    speakExchange,
    playItem,
    playQuestionerItem,
    playSubItem,
  }
}
