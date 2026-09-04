import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { characterApi } from '@/services/api'
import type { Character } from '@/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Plus, Pencil, Trash2, X, Sparkles, MessageSquare, Settings } from 'lucide-react'

const LANGUAGES = [
  { value: 'thai', label: '🇹🇭 ไทย (Thai)' },
  { value: 'english', label: '🇬🇧 อังกฤษ (English)' },
  { value: 'japanese', label: '🇯🇵 ญี่ปุ่น (Japanese)' },
  { value: 'korean', label: '🇰🇷 เกาหลี (Korean)' },
  { value: 'chinese', label: '🇨🇳 จีน (Chinese)' },
  { value: 'spanish', label: '🇪🇸 สเปน (Spanish)' },
  { value: 'french', label: '🇫🇷 ฝรั่งเศส (French)' },
  { value: 'german', label: '🇩🇪 เยอรมัน (German)' },
]

interface FormData {
  name: string;
  name_th: string;
  name_en: string;
  description: string;
  system_prompt: string;
  avatar_url: string;
  response_language: string;
  response_length: 'short' | 'normal' | 'long' | 'custom';
  enable_per_user_memory: boolean;
  memory_duration_days: number;
  system_prompt_ai: string;
}

const emptyForm: FormData = {
  name: '',
  name_th: '',
  name_en: '',
  description: '',
  system_prompt: '',
  avatar_url: '',
  response_language: 'thai',
  response_length: 'short',
  enable_per_user_memory: true,
  memory_duration_days: 3,
  system_prompt_ai: '',
}

export default function CharactersPage() {
  const { id: editId } = useParams()
  const navigate = useNavigate()
  const [characters, setCharacters] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [isEdit, setIsEdit] = useState(false)
  const [formData, setFormData] = useState<FormData>(emptyForm)
  const [showAiModal, setShowAiModal] = useState(false)
  const [aiPromptCharacter, setAiPromptCharacter] = useState<Character | null>(null)
  const [aiPromptText, setAiPromptText] = useState('')
  const [aiPromptStats, setAiPromptStats] = useState<{ messages_analyzed: number; total_messages: number } | null>(null)

  useEffect(() => {
    loadCharacters()
  }, [])

  useEffect(() => {
    if (editId) {
      loadCharacter(editId)
    }
  }, [editId])

  const loadCharacters = async () => {
    try {
      setLoading(true)
      const data = await characterApi.getAll()
      setCharacters(data)
    } catch {
      console.error('Failed to load characters')
    } finally {
      setLoading(false)
    }
  }

  const loadCharacter = async (id: string) => {
    try {
      const char = await characterApi.getById(id)
      setFormData({
        name: char.name || '',
        name_th: char.name_th || '',
        name_en: char.name_en || '',
        description: char.description || '',
        system_prompt: char.system_prompt || '',
        avatar_url: char.avatar_url || '',
        response_language: char.response_language || 'thai',
        response_length: char.response_length || 'short',
        enable_per_user_memory: char.enable_per_user_memory,
        memory_duration_days: char.memory_duration_days,
        system_prompt_ai: char.system_prompt_ai || '',
      })
      setIsEdit(true)
      setShowForm(true)
    } catch {
      console.error('Failed to load character')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSaving(true)
      if (isEdit && editId) {
        await characterApi.update(editId, formData)
      } else {
        await characterApi.create(formData)
      }
      setShowForm(false)
      setIsEdit(false)
      setFormData(emptyForm)
      loadCharacters()
    } catch {
      console.error('Failed to save character')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setShowForm(false)
    setIsEdit(false)
    setFormData(emptyForm)
    navigate('/characters')
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this character?')) return
    try {
      await characterApi.delete(id)
      loadCharacters()
    } catch {
      console.error('Failed to delete character')
    }
  }

  const handleGeneratePrompt = async (character: Character) => {
    setAiPromptCharacter(character)
    setAiPromptText(character.system_prompt_ai || '')
    setAiPromptStats(null)
    setShowAiModal(true)
    try {
      const result = await characterApi.generatePrompt(character.id)
      setAiPromptText(result.system_prompt_ai)
      setAiPromptStats({ messages_analyzed: result.messages_analyzed, total_messages: result.total_messages })
    } catch (err: any) {
      console.error('Failed to generate prompt:', err.response?.data?.error)
    }
  }

  const handleSaveAiPrompt = async () => {
    if (!aiPromptCharacter || !aiPromptText.trim()) return
    try {
      await characterApi.update(aiPromptCharacter.id, { system_prompt_ai: aiPromptText })
      setShowAiModal(false)
      loadCharacters()
    } catch {
      console.error('Failed to save AI prompt')
    }
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
          <Link to="/characters" className="flex items-center gap-1 px-3 py-1 text-sm text-primary bg-primary/10 rounded">
            <Sparkles className="h-3 w-3" />Characters
          </Link>
          <Link to="/settings" className="flex items-center gap-1 px-3 py-1 text-sm text-text-muted hover:text-text rounded hover:bg-surface-light">
            <Settings className="h-3 w-3" />Provider Settings
          </Link>
        </nav>
      </header>

      <div className="p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Characters</h1>
              <p className="text-text-muted">Manage your AI VTuber characters</p>
            </div>
            <Button onClick={() => navigate('/characters/new')}>
              <Plus className="h-4 w-4 mr-2" />
              Add Character
            </Button>
          </div>

          {showForm && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{isEdit ? 'Edit Character' : 'New Character'}</CardTitle>
                  <Button variant="ghost" size="icon" onClick={handleCancel}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Name (English)</label>
                      <Input value={formData.name_en} onChange={(e) => setFormData({ ...formData, name_en: e.target.value })} placeholder="e.g. Mena" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Name (Thai)</label>
                      <Input value={formData.name_th} onChange={(e) => setFormData({ ...formData, name_th: e.target.value })} placeholder="e.g. มีนา" />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <label className="text-sm font-medium">Display Name</label>
                      <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Character name" required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Avatar URL</label>
                      <Input value={formData.avatar_url} onChange={(e) => setFormData({ ...formData, avatar_url: e.target.value })} placeholder="https://..." />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Description</label>
                    <Input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Short description" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">System Prompt</label>
                    <textarea
                      value={formData.system_prompt}
                      onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
                      placeholder="Define the character's personality and behavior..."
                      rows={4}
                      className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Language</label>
                      <select
                        value={formData.response_language}
                        onChange={(e) => setFormData({ ...formData, response_language: e.target.value })}
                        className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {LANGUAGES.map((lang) => (
                          <option key={lang.value} value={lang.value}>{lang.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Response Length</label>
                      <select
                        value={formData.response_length}
                        onChange={(e) => setFormData({ ...formData, response_length: e.target.value as any })}
                        className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <option value="short">Short (1-2 ประโยค)</option>
                        <option value="normal">Normal (2-4 ประโยค)</option>
                        <option value="long">Long (เต็มที่)</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="enable_memory"
                        checked={formData.enable_per_user_memory}
                        onChange={(e) => setFormData({ ...formData, enable_per_user_memory: e.target.checked })}
                        className="rounded border-border"
                      />
                      <label htmlFor="enable_memory" className="text-sm font-medium">Per-user Memory</label>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Memory Duration (days)</label>
                      <Input
                        type="number"
                        value={formData.memory_duration_days}
                        onChange={(e) => setFormData({ ...formData, memory_duration_days: parseInt(e.target.value) || 3 })}
                        min="1"
                        max="30"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button type="submit" disabled={saving}>
                      {saving ? 'Saving...' : (isEdit ? 'Update' : 'Create')}
                    </Button>
                    <Button type="button" variant="outline" onClick={handleCancel}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {!showForm && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {loading ? (
                <p className="text-text-muted">Loading...</p>
              ) : characters.length === 0 ? (
                <Card className="col-span-2">
                  <CardContent className="pt-6 text-center py-12">
                    <p className="text-text-muted">No characters yet. Click "Add Character" to create one!</p>
                  </CardContent>
                </Card>
              ) : (
                characters.map((char) => (
                  <Card key={char.id} className="hover:border-primary/50 transition-colors">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{char.name_th || char.name}</CardTitle>
                          <CardDescription>{char.description || 'No description'}</CardDescription>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleGeneratePrompt(char)}>
                            <Sparkles className="h-4 w-4 text-secondary" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => navigate(`/characters/edit/${char.id}`)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(char.id)}>
                            <Trash2 className="h-4 w-4 text-error" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2 text-xs text-text-muted">
                        <span>{char.response_language}</span>
                        <span>•</span>
                        <span>{char.response_length}</span>
                        <span>•</span>
                        <span>{char.memory_duration_days}d memory</span>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

          {showAiModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAiModal(false)} />
              <div className="relative bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
                <div className="flex items-center justify-between p-6 border-b border-border">
                  <div>
                    <h2 className="text-lg font-semibold">Generate AI Prompt</h2>
                    <p className="text-xs text-text-muted">
                      AI will analyze chat history and generate a character prompt
                      {aiPromptStats && ` (${aiPromptStats.messages_analyzed}/${aiPromptStats.total_messages} messages)`}
                    </p>
                  </div>
                  <button onClick={() => setShowAiModal(false)} className="p-2 rounded-lg hover:bg-surface-light">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="p-6">
                  <textarea
                    value={aiPromptText}
                    onChange={(e) => setAiPromptText(e.target.value)}
                    rows={12}
                    className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary font-mono"
                  />
                </div>
                <div className="flex items-center justify-end gap-3 p-6 border-t border-border">
                  <Button variant="outline" onClick={() => setShowAiModal(false)}>Cancel</Button>
                  <Button onClick={handleSaveAiPrompt}>Save Prompt</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
