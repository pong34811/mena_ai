/**
 * useHowlerTTS — client-side TTS playback using a managed <audio> element
 *
 * Replaces the Howler.js / Web Audio approach with a single <audio> element
 * using HTMLMediaElement.setSinkId for output device routing — the only
 * mechanism proven to reliably route audio to the selected device.
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { ttsApi, outputDeviceApi } from '@/services/api'

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
  questioner_text: string
  questioner_author?: string
  responder_text: string
  source?: string
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

function detectPlatform(): string {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('windows')) return 'windows'
  if (ua.includes('mac') || ua.includes('ios')) return 'macos'
  if (ua.includes('linux')) return 'linux'
  return 'other'
}

export function useHowlerTTS(initialSettings?: TTSSettings) {
  const [state, setState] = useState<HowlerTTSState>({
    isPlaying: false,
    currentItem: null,
    settings: initialSettings || defaultSettings,
  })

  const settingsRef = useRef<TTSSettings>(state.settings)
  settingsRef.current = state.settings
  const currentItemRef = useRef<TTSQueueItem | null>(state.currentItem)
  currentItemRef.current = state.currentItem

  // Single managed <audio> element (detached — works in Chromium)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio()
      audioRef.current.preload = 'auto'
      audioRef.current.volume = 1.0
    }
    return audioRef.current
  }, [])

  // Primer element for unlocking autoplay (separate to avoid clobbering active src)
  const primerRef = useRef<HTMLAudioElement | null>(null)
  const getPrimer = useCallback(() => {
    if (!primerRef.current) {
      primerRef.current = new Audio()
      // Minimal silent WAV data URI for priming playback
      primerRef.current.src =
        'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='
    }
    return primerRef.current
  }, [])

  const unlockPrime = useCallback(async () => {
    try {
      const primer = getPrimer()
      primer.muted = true
      primer.currentTime = 0
      await primer.play()
      primer.pause()
      primer.muted = false
    } catch {
      // Autoplay still blocked — will unlock on next gesture
    }
  }, [getPrimer])

  // Output device routing
  const appliedSinkRef = useRef<string>('')
  const applyOutputDevice = useCallback(async (deviceId: string) => {
    const audio = getAudio()
    const sinkId = (audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId
    if (!sinkId) {
      console.warn('[TTS] setSinkId not supported — output device routing unavailable')
      return
    }
    if (appliedSinkRef.current === deviceId) return
    try {
      await sinkId.call(audio, deviceId)
      appliedSinkRef.current = deviceId
      console.info(`[TTS] Output device set to: ${deviceId || 'default'}`)
    } catch (err) {
      console.error('[TTS] Failed to set output device:', err)
    }
  }, [getAudio])

  // Queue state
  const pendingRef = useRef<TTSQueueItem[]>([])
  const drainingRef = useRef(false)
  const spokenRef = useRef<Set<string>>(new Set())
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pauseResolveRef = useRef<(() => void) | null>(null)
  const playResolverRef = useRef<(() => void) | null>(null)

  const cancelPause = useCallback(() => {
    if (pauseTimerRef.current !== null) {
      clearTimeout(pauseTimerRef.current)
      pauseTimerRef.current = null
    }
    pauseResolveRef.current?.()
    pauseResolveRef.current = null
  }, [])

  // loadSettings: fetch settings + current device from backend
  const loadSettings = useCallback(async () => {
    try {
      const [settingsResponse, currentDevice] = await Promise.all([
        fetch('/api/tts/settings/'),
        outputDeviceApi.getCurrent().catch(() => ({ device: null })),
      ])
      const data = settingsResponse.ok ? await settingsResponse.json() : null
      if (!data) return
      if (currentDevice?.device?.device_id) {
        data.output_device_id = currentDevice.device.device_id
      }
      setState((prev) => ({ ...prev, settings: data }))
      settingsRef.current = data
      if (data.output_device_id) {
        setTimeout(() => applyOutputDevice(data.output_device_id), 0)
      }
    } catch (err) {
      console.error('Failed to load TTS settings:', err)
    }
  }, [applyOutputDevice])

  // Load settings on mount if not provided; stop audio on unmount
  useEffect(() => {
    if (!initialSettings) {
      loadSettings().catch(console.error)
    }
    return () => {
      const audio = audioRef.current
      if (audio) {
        audio.pause()
        audio.removeAttribute('src')
      }
      audioRef.current = null
      primerRef.current = null
    }
  }, [initialSettings])

  // Hydrate: unlock playback on first user gesture (pointerdown / keydown)
  useEffect(() => {
    const prime = () => {
      unlockPrime().catch(() => {})
    }
    window.addEventListener('pointerdown', prime, { once: true })
    window.addEventListener('keydown', prime, { once: true })
    return () => {
      window.removeEventListener('pointerdown', prime)
      window.removeEventListener('keydown', prime)
    }
  }, [unlockPrime])

  const stopActive = useCallback(() => {
    cancelPause()
    const audio = audioRef.current
    if (audio) {
      audio.pause()
    }
    const resolve = playResolverRef.current
    playResolverRef.current = null
    resolve?.()
  }, [cancelPause])

  // Play a single piece of audio, resolving when it finishes (or is stopped)
  const playSubItem = useCallback(async (text: string, voice: string, rate: string) => {
    try {
      const deviceId = settingsRef.current?.output_device_id
      if (deviceId) {
        await applyOutputDevice(deviceId)
      }

      const blob = await ttsApi.generate(text, voice, rate)
      if (!blob) return

      const audio = getAudio()
      const url = URL.createObjectURL(blob)
      stopActive()
      audio.src = url
      audio.muted = false

      await new Promise<void>((resolve) => {
        playResolverRef.current = resolve
        let resolved = false
        const finish = () => {
          if (resolved) return
          resolved = true
          if (playResolverRef.current === resolve) playResolverRef.current = null
          URL.revokeObjectURL(url)
          resolve()
        }
        const onEnded = () => finish()
        const onError = () => {
          console.error('TTS audio error')
          finish()
        }
        audio.addEventListener('ended', onEnded, { once: true })
        audio.addEventListener('error', onError, { once: true })

        audio.play().catch(async () => {
          if (resolved) return
          // Autoplay blocked — unlock via primer, then retry once
          try {
            await unlockPrime()
            if (deviceId) await applyOutputDevice(deviceId)
            if (resolved) return
            await audio.play()
          } catch {
            finish()
          }
        })
      })
    } catch (err) {
      console.error('Sub-item TTS error:', err)
    }
  }, [stopActive, applyOutputDevice, getAudio, unlockPrime])

  const setCurrent = useCallback((item: TTSQueueItem | null, isPlaying = false) => {
    currentItemRef.current = item
    setState((prev) => ({ ...prev, isPlaying, currentItem: item }))
  }, [])

  const playQuestionerItem = useCallback(async (item: TTSQueueItem) => {
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

  const playItem = useCallback(async (item: TTSQueueItem) => {
    setCurrent(item, true)
    await playSubItem(item.text, item.voice, item.rate)
    if (currentItemRef.current?.id === item.id) {
      setCurrent(null)
    }
  }, [playSubItem, setCurrent])

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

  const unlockAudio = useCallback(async () => {
    await unlockPrime()
    const deviceId = settingsRef.current?.output_device_id
    if (deviceId) {
      await applyOutputDevice(deviceId)
    }
  }, [unlockPrime, applyOutputDevice])

  // Capture device to backend + update local state + apply sink
  const setOutputDevice = useCallback(async (deviceId: string, label?: string) => {
    const platform = detectPlatform()
    const capturePromise = outputDeviceApi
      .capture(deviceId, label || deviceId || 'default', platform)
      .catch((err) => console.error('[TTS] Failed to capture output device:', err))

    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, output_device_id: deviceId },
    }))
    settingsRef.current = { ...settingsRef.current, output_device_id: deviceId } as TTSSettings
    appliedSinkRef.current = ''
    await applyOutputDevice(deviceId)
    await capturePromise
  }, [applyOutputDevice])

  const supportsOutputRouting = useCallback(() => {
    const audio = getAudio()
    return typeof (audio as HTMLAudioElement & { setSinkId?: unknown }).setSinkId === 'function'
  }, [getAudio])

  // Listen for settings changes from TTSSettingsPage
  useEffect(() => {
    const onSaved = async () => {
      await loadSettings()
      const deviceId = settingsRef.current?.output_device_id
      if (deviceId) {
        appliedSinkRef.current = ''
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
    setOutputDevice,
    supportsOutputRouting,
  }
}