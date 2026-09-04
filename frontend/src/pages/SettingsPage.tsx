import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { healthApi, llmStatusApi } from '@/services/api'
import type { LLMProvider } from '@/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Plus, Zap, Check, X, MessageSquare, Sparkles, Settings } from 'lucide-react'

export default function SettingsPage() {
  const [providers, setProviders] = useState<LLMProvider[]>([])
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [healthStatus, setHealthStatus] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: '',
    api_url: '',
    api_key: '',
    model_name: '',
    temperature: 0.7,
    max_tokens: 2048,
    is_active: true,
  })

  useEffect(() => {
    loadProviders()
    checkHealth()
  }, [])

  const checkHealth = async () => {
    try {
      const result = await healthApi.check()
      setHealthStatus(result.llm_api)
    } catch {
      setHealthStatus('disconnected')
    }
  }

  const loadProviders = async () => {
    try {
      setLoading(true)
      const data = await llmStatusApi.getProviders()
      setProviders(data)
      if (data.length > 0) {
        setSelectedProvider(data[0])
        setFormData({
          name: data[0].name || '',
          api_url: data[0].api_url || '',
          api_key: data[0].api_key || '',
          model_name: data[0].model_name || '',
          temperature: data[0].temperature || 0.7,
          max_tokens: data[0].max_tokens || 2048,
          is_active: data[0].is_active !== false,
        })
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to load providers' })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!selectedProvider) return

    try {
      setSaving(true)
      await llmStatusApi.updateProvider(selectedProvider.id, formData)
      setMessage({ type: 'success', text: 'Settings saved successfully!' })
      loadProviders()
    } catch {
      setMessage({ type: 'error', text: 'Failed to save settings' })
    } finally {
      setSaving(false)
    }
  }

  const handleAddProvider = async () => {
    try {
      setSaving(true)
      await llmStatusApi.createProvider({
        name: 'New Provider',
        api_url: 'http://127.0.0.1:31415/v1/chat/completions',
        api_key: '',
        model_name: 'auto',
        temperature: 0.7,
        max_tokens: 2048,
        is_active: true,
      })
      setMessage({ type: 'success', text: 'Provider added!' })
      loadProviders()
    } catch {
      setMessage({ type: 'error', text: 'Failed to add provider' })
    } finally {
      setSaving(false)
    }
  }

  const selectProvider = (provider: LLMProvider) => {
    setSelectedProvider(provider)
    setFormData({
      name: provider.name || '',
      api_url: provider.api_url || '',
      api_key: provider.api_key || '',
      model_name: provider.model_name || '',
      temperature: provider.temperature || 0.7,
      max_tokens: provider.max_tokens || 2048,
      is_active: provider.is_active !== false,
    })
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Simple Navbar */}
      <header className="h-12 border-b border-border bg-surface px-4 flex items-center gap-4">
        <span className="font-semibold text-sm text-text">MENA AI VTuber</span>
        <nav className="flex items-center gap-1 ml-4">
          <Link to="/chat" className="flex items-center gap-1 px-3 py-1 text-sm text-text-muted hover:text-text rounded hover:bg-surface-light">
            <MessageSquare className="h-3 w-3" />Chat
          </Link>
          <Link to="/characters" className="flex items-center gap-1 px-3 py-1 text-sm text-text-muted hover:text-text rounded hover:bg-surface-light">
            <Sparkles className="h-3 w-3" />Characters
          </Link>
          <Link to="/settings" className="flex items-center gap-1 px-3 py-1 text-sm text-primary bg-primary/10 rounded">
            <Settings className="h-3 w-3" />Provider Settings
          </Link>
        </nav>
      </header>

      <div className="p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold">LLM Provider Settings</h1>
            <p className="text-text-muted">Configure your AI providers and models</p>
          </div>

          {/* Health Status */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className={`h-3 w-3 rounded-full ${healthStatus === 'connected' ? 'bg-success animate-pulse' : 'bg-error'}`} />
                <span className="text-sm font-medium">
                  LLM API: {healthStatus === 'connected' ? 'Connected' : 'Disconnected'}
                </span>
                <Button variant="ghost" size="sm" onClick={checkHealth} className="ml-auto">
                  Refresh
                </Button>
              </div>
            </CardContent>
          </Card>

          {message && (
            <div className={`flex items-center gap-2 p-3 rounded-lg ${
              message.type === 'success' ? 'bg-success/10 text-success border border-success/50' : 'bg-error/10 text-error border border-error/50'
            }`}>
              {message.type === 'success' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
              <span className="text-sm">{message.text}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Providers</CardTitle>
                  <Button variant="ghost" size="icon" onClick={handleAddProvider} disabled={saving}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-sm text-text-muted text-center py-4">Loading...</p>
                ) : providers.length === 0 ? (
                  <p className="text-sm text-text-muted text-center py-4">No providers configured</p>
                ) : (
                  <div className="space-y-2">
                    {providers.map((provider) => (
                      <button
                        key={provider.id}
                        onClick={() => selectProvider(provider)}
                        className={`w-full flex items-center justify-between p-3 rounded-lg transition-all ${
                          selectedProvider?.id === provider.id
                            ? 'bg-primary/20 border border-primary/50'
                            : 'hover:bg-surface-light border border-transparent'
                        }`}
                      >
                        <span className="text-sm font-medium">{provider.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          provider.is_active ? 'bg-success/20 text-success' : 'bg-text-muted/20 text-text-muted'
                        }`}>
                          {provider.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {selectedProvider ? (
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Configuration</CardTitle>
                  <CardDescription>Edit provider settings</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Name</label>
                      <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Provider name" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Model</label>
                      <Input value={formData.model_name} onChange={(e) => setFormData({ ...formData, model_name: e.target.value })} placeholder="auto" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">API URL</label>
                    <Input value={formData.api_url} onChange={(e) => setFormData({ ...formData, api_url: e.target.value })} placeholder="http://127.0.0.1:31415/v1/chat/completions" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">API Key</label>
                    <Input type="password" value={formData.api_key} onChange={(e) => setFormData({ ...formData, api_key: e.target.value })} placeholder="Enter API key" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Temperature ({formData.temperature})</label>
                      <input type="range" min="0" max="2" step="0.1" value={formData.temperature} onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })} className="w-full accent-primary" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Max Tokens</label>
                      <Input type="number" value={formData.max_tokens} onChange={(e) => setFormData({ ...formData, max_tokens: parseInt(e.target.value) })} min="100" max="10000" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="is_active" checked={formData.is_active} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} className="accent-primary" />
                    <label htmlFor="is_active" className="text-sm font-medium">Active</label>
                  </div>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Settings'}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="lg:col-span-2">
                <CardContent className="pt-6 text-center py-12">
                  <Zap className="h-12 w-12 text-text-muted mx-auto mb-4" />
                  <p className="text-text-muted">Select a provider to configure</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
