import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Volume2, User, Bot, Loader2, MessageSquare, Sparkles, Settings } from 'lucide-react'
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

interface VoiceGroup {
  label: string
  voices: Array<{ id: string; name: string; gender: string }>
}

// Preset rate buttons
const RATE_PRESETS = [
  '-30%', '-20%', '-10%', '-5%', '+0%', '+5%', '+10%', '+20%', '+30%',
]

function RateSelector({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex gap-1 flex-wrap">
      {RATE_PRESETS.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className={`px-2 py-0.5 rounded text-xs border transition-colors ${
            value === r
              ? 'bg-primary/20 border-primary text-primary font-medium'
              : 'border-border bg-surface-light text-text-muted hover:bg-surface hover:border-primary/50'
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

export default function TTSSettingsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [settings, setSettings] = useState<TTSSettings | null>(null)
  const [voices, setVoices] = useState<VoiceGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testPlaying, setTestPlaying] = useState<string | null>(null)
  const [testError, setTestError] = useState<string | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    setLoading(true)
    try {
      const [settingsRes, voicesRes] = await Promise.all([
        fetch('/api/tts/settings/'),
        ttsApi.getVoices(),
      ])
      if (settingsRes.ok) {
        const data = await settingsRes.json()
        setSettings(data)
      }
      if (voicesRes.voices) {
        const groups: VoiceGroup[] = Object.entries(voicesRes.voices).map(
          ([label, v]) => ({
            label: label.charAt(0).toUpperCase() + label.slice(1),
            voices: v,
          })
        )
        setVoices(groups)
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
      // Broadcast saved event so ChatPage can reload
      window.dispatchEvent(new CustomEvent('tts-settings-saved'))
      if (response.ok) {
        navigate(location.state?.from?.pathname || '/chat', { replace: true })
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
        setTestError('เบราว์เซอร์ไม่อนุญาตให้เล่นเสียง — กดเล่นเองในหน้าแชร์ไฟล์')
      }
      await audio.play()
    } catch (err: any) {
      setTestPlaying(null)
      setTestError(err?.message || (err as any)?.toString?.() || 'ไม่สามารถสร้างเสียงได้')
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="h-12 border-b border-border bg-surface px-4 flex items-center gap-4">
        <span className="font-semibold text-sm text-text">MENA AI VTuber</span>
        <nav className="flex items-center gap-1 ml-4">
          <Link to="/chat" className="flex items-center gap-1 px-3 py-1 text-sm text-text-muted hover:text-text rounded hover:bg-surface-light">
            <MessageSquare className="h-3 w-3" />Chat
          </Link>
          <Link to="/characters" className="flex items-center gap-1 px-3 py-1 text-sm text-text-muted hover:text-text rounded hover:bg-surface-light">
            <Sparkles className="h-3 w-3" />Characters
          </Link>
          <Link to="/settings" className="flex items-center gap-1 px-3 py-1 text-sm text-text-muted hover:text-text rounded hover:bg-surface-light">
            <Settings className="h-3 w-3" />Provider Settings
          </Link>
          <Link to="/tts-settings" className="flex items-center gap-1 px-3 py-1 text-sm text-primary bg-primary/10 rounded">
            <Volume2 className="h-3 w-3" />TTS Settings
          </Link>
        </nav>
      </header>

      <div className="max-w-2xl mx-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : settings ? (
          <div className="space-y-8">
            {/* Questioner Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="h-5 w-5 text-red-400" />
                  <h2 className="text-lg font-semibold text-text">ผู้ถาม (Questioner)</h2>
                  <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">YouTube Chat</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.questioner_enabled}
                    onChange={(e) =>
                      setSettings({ ...settings, questioner_enabled: e.target.checked })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-surface-light peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-muted after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary peer-checked:after:bg-white"></div>
                </label>
              </div>

              {settings.questioner_enabled && (
                <div className="pl-2 space-y-3 border-l-2 border-red-500/30">
                  {/* Voice */}
                  <div>
                    <label className="text-xs text-text-muted block mb-1">เสียง</label>
                    <div className="flex gap-2">
                      <select
                        value={settings.questioner_voice}
                        onChange={(e) =>
                          setSettings({ ...settings, questioner_voice: e.target.value })
                        }
                        className="flex-1 text-sm bg-surface-light border border-border rounded-lg px-3 py-2 text-text focus:outline-none focus:border-primary"
                      >
                        {voices.map((g) => (
                          <optgroup key={g.label} label={g.label}>
                            {g.voices.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name}
                              </option>
                            ))}
                          </optgroup>
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

                  {/* Rate */}
                  <div>
                    <label className="text-xs text-text-muted block mb-1">ความเร็ว (Rate)</label>
                    <RateSelector
                      value={settings.questioner_rate}
                      onChange={(v) =>
                        setSettings({ ...settings, questioner_rate: v })
                      }
                    />
                  </div>

                  {/* Say username */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.questioner_say_username}
                      onChange={(e) =>
                        setSettings({ ...settings, questioner_say_username: e.target.checked })
                      }
                      className="rounded border-border"
                    />
                    <span className="text-sm text-text">พูดชื่อผู้ใช้ก่อนข้อความ</span>
                  </label>
                  {settings.questioner_say_username && (
                    <div className="pl-6 space-y-2">
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
                          className="w-24 text-sm bg-surface-light border border-border rounded-lg px-3 py-2 text-text focus:outline-none focus:border-primary"
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
                  <Bot className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold text-text">ผู้ตอบ (Responder)</h2>
                  <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">Character</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.responder_enabled}
                    onChange={(e) =>
                      setSettings({ ...settings, responder_enabled: e.target.checked })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-surface-light peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-muted after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary peer-checked:after:bg-white"></div>
                </label>
              </div>

              {settings.responder_enabled && (
                <div className="pl-2 space-y-3 border-l-2 border-primary/30">
                  {/* Voice */}
                  <div>
                    <label className="text-xs text-text-muted block mb-1">เสียง</label>
                    <div className="flex gap-2">
                      <select
                        value={settings.responder_voice}
                        onChange={(e) =>
                          setSettings({ ...settings, responder_voice: e.target.value })
                        }
                        className="flex-1 text-sm bg-surface-light border border-border rounded-lg px-3 py-2 text-text focus:outline-none focus:border-primary"
                      >
                        {voices.map((g) => (
                          <optgroup key={g.label} label={g.label}>
                            {g.voices.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name}
                              </option>
                            ))}
                          </optgroup>
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

                  {/* Rate */}
                  <div>
                    <label className="text-xs text-text-muted block mb-1">ความเร็ว (Rate)</label>
                    <RateSelector
                      value={settings.responder_rate}
                      onChange={(v) =>
                        setSettings({ ...settings, responder_rate: v })
                      }
                    />
                  </div>

                  <p className="text-xs text-text-muted pl-2">
                    เล่นเฉพาะข้อความตอบกลับเท่านั้น
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <Button variant="outline" onClick={() => navigate(-1)}>
                ยกเลิก
              </Button>
              <Button onClick={handleSave} disabled={saving || !settings}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'บันทึก'
                )}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted text-center py-8">Failed to load settings</p>
        )}
      </div>
    </div>
  )
}
