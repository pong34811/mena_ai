import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2, MessageSquare, Sparkles, Settings, Plug, Wifi, WifiOff, TestTube } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface VTubeStudioSettings {
  id: number
  api_url: string
  port: number
  is_connected: boolean
  updated_at: string
}

export default function VTubeStudioPage() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState<VTubeStudioSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/vtube/settings/')
      if (res.ok) {
        const data = await res.json()
        setSettings(data)
      }
    } catch (err) {
      console.error('Failed to load VTube Studio settings:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/vtube/settings/update/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_url: settings.api_url,
          port: settings.port,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setSettings(data)
      }
    } catch (err) {
      console.error('Failed to save VTube Studio settings:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/vtube/test-connection/', {
        method: 'POST',
      })
      const data = await res.json()
      setTestResult({
        success: res.ok,
        message: data.message || data.error || 'ไม่ทราบสถานะ',
      })
      loadSettings()
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'ไม่สามารถทดสอบการเชื่อมต่อได้',
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
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
          <Link to="/vtube-studio" className="flex items-center gap-1 px-3 py-1 text-sm text-primary bg-primary/10 rounded">
            <Plug className="h-3 w-3" />VTube Studio
          </Link>
        </nav>
      </header>

      <div className="max-w-2xl mx-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : settings ? (
          <div className="space-y-6">
            <div className="flex items-center gap-3 p-4 rounded-lg border border-border bg-surface">
              {settings.is_connected ? (
                <>
                  <Wifi className="h-5 w-5 text-green-400" />
                  <div>
                    <p className="text-sm font-medium text-green-400">เชื่อมต่อแล้ว</p>
                    <p className="text-xs text-text-muted">VTube Studio API พร้อมใช้งาน</p>
                  </div>
                </>
              ) : (
                <>
                  <WifiOff className="h-5 w-5 text-red-400" />
                  <div>
                    <p className="text-sm font-medium text-red-400">ไม่ได้เชื่อมต่อ</p>
                    <p className="text-xs text-text-muted">กดทดสอบการเชื่อมต่อเพื่อตรวจสอบ</p>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-4 p-4 rounded-lg border border-border bg-surface">
              <h2 className="text-lg font-semibold text-text flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                ตั้งค่าการเชื่อมต่อ
              </h2>

              <div>
                <label className="text-xs text-text-muted block mb-1">WebSocket URL</label>
                <input
                  type="text"
                  value={settings.api_url}
                  onChange={(e) => setSettings({ ...settings, api_url: e.target.value })}
                  placeholder="ws://0.0.0.0:9000"
                  className="w-full text-sm bg-surface-light border border-border rounded-lg px-3 py-2 text-text focus:outline-none focus:border-primary"
                />
                <p className="text-xs text-text-muted mt-1">ที่อยู่ WebSocket ของ VTube Studio API</p>
              </div>

              <div>
                <label className="text-xs text-text-muted block mb-1">Port</label>
                <input
                  type="number"
                  value={settings.port}
                  onChange={(e) => setSettings({ ...settings, port: parseInt(e.target.value) || 9000 })}
                  min={1}
                  max={65535}
                  className="w-32 text-sm bg-surface-light border border-border rounded-lg px-3 py-2 text-text focus:outline-none focus:border-primary"
                />
                <p className="text-xs text-text-muted mt-1">Port ที่ VTube Studio เปิด API (ค่าเริ่มต้น: 9000)</p>
              </div>
            </div>

            {testResult && (
              <div className={`p-4 rounded-lg border ${testResult.success ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
                <p className={`text-sm ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
                  {testResult.message}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <Button variant="outline" onClick={handleTestConnection} disabled={testing}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <TestTube className="h-4 w-4 mr-2" />}
                ทดสอบการเชื่อมต่อ
              </Button>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => navigate(-1)}>ยกเลิก</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'บันทึก'}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted text-center py-8">Failed to load settings</p>
        )}
      </div>
    </div>
  )
}
