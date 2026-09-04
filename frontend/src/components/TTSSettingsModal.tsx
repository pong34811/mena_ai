import { useState, useEffect } from 'react'
import { X, Volume2, User, Bot, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ttsApi } from '@/services/api'

interface TTSSettings {
  questioner_enabled: boolean
  questioner_voice: string
  questioner_rate: string
  questioner_say_username: boolean
  responder_enabled: boolean
  responder_voice: string
  responder_rate: string
  responder_delay_ms: number
}

interface TTSSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  onSettingsChange?: () => void
}

const VOICE_OPTIONS = [
  { id: 'th-TH-PremwadeeNeural', name: 'Thai Female (Premwadee)', lang: 'Thai' },
  { id: 'th-TH-NiwatNeural', name: 'Thai Male (Niwat)', lang: 'Thai' },
  { id: 'en-US-AriaNeural', name: 'US Aria (Female)', lang: 'English' },
  { id: 'en-US-GuyNeural', name: 'US Guy (Male)', lang: 'English' },
  { id: 'en-US-JennyNeural', name: 'US Jenny (Female)', lang: 'English' },
  { id: 'en-US-MichelleNeural', name: 'US Michelle (Female)', lang: 'English' },
  { id: 'en-GB-SoniaNeural', name: 'UK Sonia (Female)', lang: 'English' },
  { id: 'en-GB-RyanNeural', name: 'UK Ryan (Male)', lang: 'English' },
  { id: 'ja-JP-NanamiNeural', name: 'JP Nanami (Female)', lang: 'Japanese' },
  { id: 'ja-JP-KeitaNeural', name: 'JP Keita (Male)', lang: 'Japanese' },
]

export function TTSSettingsModal({ isOpen, onClose, onSettingsChange }: TTSSettingsModalProps) {
  const [settings, setSettings] = useState<TTSSettings | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testPlaying, setTestPlaying] = useState<string | null>(null)
  const [testError, setTestError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadSettings()
    }
  }, [isOpen])

  const loadSettings = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/tts/settings/')
      if (response.ok) {
        const data = await response.json()
        setSettings(data)
      }
    } catch (err) {
      console.error('Failed to load TTS settings:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    try {
      const response = await fetch('/api/tts/settings/update/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (response.ok) {
        onSettingsChange?.()
        onClose()
      }
    } catch (err) {
      console.error('Failed to save TTS settings:', err)
    } finally {
      setSaving(false)
    }
  }

  const testVoice = async (voiceId: string, type: string) => {
    if (testPlaying === type) return
    setTestPlaying(type)
    setTestError(null)
    try {
      const blob = await ttsApi.generate(`สวัสดีค่ะ นี่คือเสียงทดสอบ`, voiceId)
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => {
        URL.revokeObjectURL(url)
        setTestPlaying(null)
      }
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        setTestPlaying(null)
        setTestError('เบราว์เซอร์ไม่อนุญาตให้เล่นเสียง — ลองกดใหม่')
      }
      await audio.play()
    } catch (err: any) {
      setTestPlaying(null)
      setTestError(err?.message || 'ไม่สามารถสร้างเสียงได้')
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Volume2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text">TTS Settings</h2>
              <p className="text-xs text-text-muted">ตั้งค่าเสียงสำหรับผู้ถามและผู้ตอบ</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-light transition-colors text-text-muted hover:text-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : settings ? (
            <>
              {/* Questioner Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-red-400" />
                    <h3 className="font-medium text-text">ผู้ถาม (Questioner)</h3>
                    <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">YouTube Chat</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.questioner_enabled}
                      onChange={(e) => setSettings({ ...settings, questioner_enabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-surface-light peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-muted after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary peer-checked:after:bg-white"></div>
                  </label>
                </div>

                {settings.questioner_enabled && (
                  <div className="pl-6 space-y-3 border-l-2 border-red-500/30">
                    <div>
                      <label className="text-xs text-text-muted block mb-1">เสียง</label>
                      <div className="flex gap-2">
                        <select
                          value={settings.questioner_voice}
                          onChange={(e) => setSettings({ ...settings, questioner_voice: e.target.value })}
                          className="flex-1 text-sm bg-surface-light border border-border rounded-lg px-3 py-2 text-text focus:outline-none focus:border-primary"
                        >
                          {VOICE_OPTIONS.map((v) => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => testVoice(settings.questioner_voice, 'questioner')}
                          disabled={testPlaying === 'questioner'}
                        >
                          {testPlaying === 'questioner' ? '🔊' : '▶'}
                        </Button>
                      </div>
                      {testError && (
                        <p className="text-xs text-red-400 mt-1">{testError}</p>
                      )}
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.questioner_say_username}
                        onChange={(e) => setSettings({ ...settings, questioner_say_username: e.target.checked })}
                        className="rounded border-border"
                      />
                      <span className="text-sm text-text">พูดชื่อผู้ใช้ก่อนข้อความ</span>
                    </label>
                    {settings.questioner_say_username && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-text-muted">เวลารอก่อนข้อความ</label>
                          <input
                            type="number"
                            min={0}
                            max={30}
                            step={0.1}
                            value={Number(((settings.responder_delay_ms || 0) / 1000).toFixed(2))}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                responder_delay_ms: Math.round((Number(e.target.value) || 0) * 1000),
                              })
                            }
                            className="w-24 text-sm bg-surface-light border border-border rounded-lg px-3 py-1.5 text-text focus:outline-none focus:border-primary"
                          />
                          <span className="text-xs text-text-muted">วินาที</span>
                        </div>
                        <p className="text-xs text-text-muted">
                          เช่น: "username... (รอ {Number(((settings.responder_delay_ms || 0) / 1000).toFixed(2))} วินาที)... ข้อความที่ส่งมา"
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="border-t border-border" />

              {/* Responder Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-primary" />
                    <h3 className="font-medium text-text">ผู้ตอบ (Responder)</h3>
                    <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">Character</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.responder_enabled}
                      onChange={(e) => setSettings({ ...settings, responder_enabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-surface-light peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-muted after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary peer-checked:after:bg-white"></div>
                  </label>
                </div>

                {settings.responder_enabled && (
                  <div className="pl-6 space-y-3 border-l-2 border-primary/30">
                    <div>
                      <label className="text-xs text-text-muted block mb-1">เสียง</label>
                      <div className="flex gap-2">
                        <select
                          value={settings.responder_voice}
                          onChange={(e) => setSettings({ ...settings, responder_voice: e.target.value })}
                          className="flex-1 text-sm bg-surface-light border border-border rounded-lg px-3 py-2 text-text focus:outline-none focus:border-primary"
                        >
                          {VOICE_OPTIONS.map((v) => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => testVoice(settings.responder_voice, 'responder')}
                          disabled={testPlaying === 'responder'}
                        >
                          {testPlaying === 'responder' ? '🔊' : '▶'}
                        </Button>
                      </div>
                      {testError && (
                        <p className="text-xs text-red-400 mt-1">{testError}</p>
                      )}
                    </div>
                    <p className="text-xs text-text-muted">เล่นเฉพาะข้อความตอบกลับเท่านั้น</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-text-muted text-center py-4">Failed to load settings</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-surface-light/50">
          <Button variant="outline" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button onClick={handleSave} disabled={saving || !settings}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'บันทึก'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export type { TTSSettings }
