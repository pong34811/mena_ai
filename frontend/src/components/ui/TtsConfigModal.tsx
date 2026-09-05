import * as React from 'react'
import { X, Volume2, VolumeX, User, Bot } from 'lucide-react'
import { Button } from './Button'
import { cn } from '@/lib/utils'

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

const VOICES = [
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
              <select
                value={userTtsVoice}
                onChange={(e) => setUserTtsVoice(e.target.value)}
                className="w-full text-sm bg-surface-light border border-border rounded-lg px-3 py-2 text-text focus:outline-none focus:border-primary"
              >
                <optgroup label="Thai">
                  {VOICES.filter(v => v.lang === 'Thai').map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </optgroup>
                <optgroup label="English">
                  {VOICES.filter(v => v.lang === 'English').map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Japanese">
                  {VOICES.filter(v => v.lang === 'Japanese').map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </optgroup>
              </select>
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
              <select
                value={aiTtsVoice}
                onChange={(e) => setAiTtsVoice(e.target.value)}
                className="w-full text-sm bg-surface-light border border-border rounded-lg px-3 py-2 text-text focus:outline-none focus:border-primary"
              >
                <optgroup label="Thai">
                  {VOICES.filter(v => v.lang === 'Thai').map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </optgroup>
                <optgroup label="English">
                  {VOICES.filter(v => v.lang === 'English').map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Japanese">
                  {VOICES.filter(v => v.lang === 'Japanese').map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </optgroup>
              </select>
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
