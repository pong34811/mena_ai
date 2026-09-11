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
  output_device_id: string
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
  questioner_voice: 'th_TH-tsync2-medium',
  questioner_rate: '+0%',
  questioner_say_username: true,
  responder_enabled: false,
  responder_voice: 'th_TH-tsync2-medium',
  responder_rate: '+0%',
  responder_delay_ms: 1000,
  output_device_id: '',
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
  const appliedSinkRef = useRef<string>('')

  // Resume the shared Howler audio context on the user's first interaction so
  // autoplay policies don't silently block TTS (chat + YouTube auto-reply).
  useEffect(() => {
    const hydrate = () => {
      const ctx = Howler.ctx as AudioContext | null
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
    }
    window.addEventListener('pointerdown', hydrate, { once: true })
    window.addEventListener('keydown', hydrate, { once: true })
    return () => {
      window.removeEventListener('pointerdown', hydrate)
      window.removeEventListener('keydown', hydrate)
    }
  }, [])

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

  const cancelPause = useCallback(() => {
    if (pauseTimerRef.current !== null) {
      clearTimeout(pauseTimerRef.current)
      pauseTimerRef.current = null
    }
    pauseResolveRef.current?.()
    pauseResolveRef.current = null
  }, [])

  // Force Howler to create its shared AudioContext. Howler initializes it
  // lazily on the first `new Howl()` / `Howler.volume()` call, so a plain
  // read of `Howler.ctx` is still null on mount — which previously made
  // setSinkId silently no-op and left chat TTS routed to the default device.
  const ensureAudioContext = useCallback(() => {
    if (!Howler.ctx && typeof Howler.volume === 'function') {
      Howler.volume(Howler.volume())
    }
    return Howler.ctx as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null
  }, [])

  // Route TTS audio to a specific output device (e.g. VB-Audio Virtual Cable).
  // Only supported in Chromium browsers via Web Audio API's setSinkId.
  const applyOutputDevice = useCallback(async (deviceId: string) => {
    const ctx = ensureAudioContext()
    if (!ctx) return

    if (typeof ctx.setSinkId !== 'function') {
      console.warn('[TTS] setSinkId not supported — output device routing unavailable')
      return
    }

    if (appliedSinkRef.current === deviceId) return

    // setSinkId only routes when the context is actually running. On a
    // suspended context Chromium either throws InvalidStateError or resolves
    // without routing — and caching that "success" would suppress every later
    // re-apply, keeping chat audio on the default device. Resume first, and
    // never cache an apply that ran pre-resume.
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {})
      if (ctx.state === 'suspended') return
    }

    try {
      await ctx.setSinkId(deviceId)
      appliedSinkRef.current = deviceId
      console.info(`[TTS] Output device set to: ${deviceId || 'default'}`)
    } catch (err) {
      console.error('[TTS] Failed to set output device:', err)
    }
  }, [ensureAudioContext])

  const loadSettings = useCallback(async () => {
    try {
      const [settingsResponse, currentResponse] = await Promise.all([
        fetch('/api/tts/settings/'),
        fetch('/api/output-devices/current/'),
      ])
      const data = settingsResponse.ok ? await settingsResponse.json() : null
      if (!data) return
      if (currentResponse.ok) {
        const { device } = await currentResponse.json()
        if (device?.device_id) {
          // Source of truth moved to the output_devices app; the settings
          // field is kept as a deprecated fallback.
          data.output_device_id = device.device_id
        }
      }
      setState((prev) => ({ ...prev, settings: data }))
      settingsRef.current = data
      if (data.output_device_id) {
        // Defer so AudioContext is ready after first user gesture
        setTimeout(() => applyOutputDevice(data.output_device_id), 0)
      }
    } catch (err) {
      console.error('Failed to load TTS settings:', err)
    }
  }, [applyOutputDevice])

  // Whether the browser supports choosing an output device for Web Audio.
  const supportsOutputRouting = useCallback(() => {
    const ctx = ensureAudioContext()
    return !!ctx && typeof ctx.setSinkId === 'function'
  }, [ensureAudioContext])

  const stopActive = useCallback(() => {
    cancelPause()
    activeHowlRef.current?.stop()
    activeHowlRef.current = null
  }, [cancelPause])

  // Play a single piece of audio, resolving when it finishes (or is stopped)
  const playSubItem = useCallback(async (text: string, voice: string, rate: string) => {
    try {
      // Re-apply the output device before playback. The first Howl in a
      // session is what actually creates Howler's AudioContext, so this is the
      // last safe place to route it before any audio starts.
      const deviceId = settingsRef.current?.output_device_id
      if (deviceId) {
        await applyOutputDevice(deviceId)
      }

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

        const onPlayError = () => {
          // Browser blocked the first play (no user gesture yet) — unlock the
          // shared context and retry once before giving up.
          const ctx = Howler.ctx as AudioContext | null
          ctx?.resume().then(async () => {
            const deviceId = settingsRef.current?.output_device_id
            if (deviceId && !appliedSinkRef.current) {
              await applyOutputDevice(deviceId)
            }
            sound.once('playerror', () => resolve())
            sound.once('end', () => resolve())
            sound.stop()
            sound.play()
          })
        }

        sound.once('playerror', onPlayError)
        sound.play()
      })

      URL.revokeObjectURL(url)
      if (activeHowlRef.current === sound) {
        activeHowlRef.current = null
      }
    } catch (err) {
      console.error('Sub-item TTS error:', err)
    }
  }, [stopActive, applyOutputDevice])

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
        const delayMs = settingsRef.current?.responder_delay_ms ?? 1000
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
      const ctx = ensureAudioContext() as AudioContext | null
      if (!ctx) return
      if (ctx.state === 'suspended') {
        await ctx.resume()
      }
      // Apply output device BEFORE any audio flows through the context, so the
      // silent buffer and subsequent TTS route to the chosen device.
      const deviceId = settingsRef.current?.output_device_id
      if (deviceId) {
        await applyOutputDevice(deviceId)
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
  }, [applyOutputDevice, ensureAudioContext])

  // Listen for settings changes so output device updates immediately
  // when the user saves TTS settings on the settings page.
  useEffect(() => {
    const onSaved = async () => {
      // Reload settings from backend to pick up the fresh output_device_id
      await loadSettings()
      const deviceId = settingsRef.current?.output_device_id
      if (deviceId) {
        applyOutputDevice(deviceId)
      }
    }
    window.addEventListener('tts-settings-saved', onSaved)
    return () => {
      window.removeEventListener('tts-settings-saved', onSaved)
    }
  }, [applyOutputDevice, loadSettings])

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
    applyOutputDevice,
    supportsOutputRouting,
  }
}
