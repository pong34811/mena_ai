import { useEffect, useState } from 'react'
import { X, Volume2, VolumeX, User, Bot, Loader2 } from 'lucide-react'
import { Button } from './Button'

interface TtsConfigModalProps {
  isOpen: boolean
  onClose: () => void
  userTtsEnabled: boolean
  setUserTtsEnabled: (enabled: boolean) => void
  userTtsVoice: string
  setUserTtsVoice: (voice: string) => void
  aiTtsEnabled: boolean
  setAiTtsEnabled: (enabled: boolean) => void
  aiTtsVoice: string
  setAiTtsVoice: (voice: string) => void
}

interface VoiceGroup {
  label: string
  voices: Array<{ id: string; name: string; gender: string }>
}

export function TtsConfigModal({
  isOpen,
  onClose,
  userTtsEnabled,
  setUserTtsEnabled,
  userTtsVoice,
  setUserTtsVoice,
  aiTtsEnabled,
  setAiTtsEnabled,
  aiTtsVoice,
  setAiTtsVoice,
}: TtsConfigModalProps) {
  const [voices, setVoices] = useState<VoiceGroup[]>([])
  const [loadingVoices, setLoadingVoices] = useState(true)

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setLoadingVoices(true)
    fetch('/api/tts/voices/')
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        if (cancelled || !data.voices) return
        const groups: VoiceGroup[] = Object.entries(data.voices).map(
          ([label, v]) => ({
            label: label.charAt(0).toUpperCase() + label.slice(1),
            voices: v as Array<{ id: string; name: string; gender: string }>,
          })
        )
        setVoices(groups)
      })
      .catch((err) => console.error('Failed to load TTS voices:', err))
      .finally(() => {
        if (!cancelled) setLoadingVoices(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Modal */}
      <div className="relative w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-semibold text-text">TTS Settings</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-surface-light text-text-muted hover:text-text transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-6">
          {/* User TTS */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary/20 border border-primary/50 flex items-center justify-center">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-medium text-text">ผู้ถาม (User)</div>
                  <div className="text-xs text-text-muted">อ่านข้อความของคุณ</div>
                </div>
              </div>
              <Button
                onClick={() => setUserTtsEnabled(!userTtsEnabled)}
                variant={userTtsEnabled ? 'default' : 'outline'}
                size="sm"
                className="flex items-center gap-1.5"
              >
                {userTtsEnabled ? (
                  <Volume2 className="h-3.5 w-3.5" />
                ) : (
                  <VolumeX className="h-3.5 w-3.5" />
                )}
                <span className="text-xs">{userTtsEnabled ? 'เปิด' : 'ปิด'}</span>
              </Button>
            </div>
            {userTtsEnabled && (
              loadingVoices ? (
                <div className="flex items-center gap-2 text-sm text-text-muted py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  กำลังโหลดรายการเสียง...
                </div>
              ) : (
                <select
                  value={userTtsVoice}
                  onChange={(e) => setUserTtsVoice(e.target.value)}
                  className="w-full text-sm bg-surface-light border border-border rounded-lg px-3 py-2 text-text focus:outline-none focus:border-primary"
                >
                  {voices.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.voices.map((v) => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* AI TTS */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <div>
                  <div className="text-sm font-medium text-text">ผู้ตอบ (AI)</div>
                  <div className="text-xs text-text-muted">อ่านข้อความของ AI</div>
                </div>
              </div>
              <Button
                onClick={() => setAiTtsEnabled(!aiTtsEnabled)}
                variant={aiTtsEnabled ? 'default' : 'outline'}
                size="sm"
                className="flex items-center gap-1.5"
              >
                {aiTtsEnabled ? (
                  <Volume2 className="h-3.5 w-3.5" />
                ) : (
                  <VolumeX className="h-3.5 w-3.5" />
                )}
                <span className="text-xs">{aiTtsEnabled ? 'เปิด' : 'ปิด'}</span>
              </Button>
            </div>
            {aiTtsEnabled && (
              loadingVoices ? (
                <div className="flex items-center gap-2 text-sm text-text-muted py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  กำลังโหลดรายการเสียง...
                </div>
              ) : (
                <select
                  value={aiTtsVoice}
                  onChange={(e) => setAiTtsVoice(e.target.value)}
                  className="w-full text-sm bg-surface-light border border-border rounded-lg px-3 py-2 text-text focus:outline-none focus:border-primary"
                >
                  {voices.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.voices.map((v) => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border">
          <Button onClick={onClose} className="w-full">
            เสร็จสิ้น
          </Button>
        </div>
      </div>
    </div>
  )
}
