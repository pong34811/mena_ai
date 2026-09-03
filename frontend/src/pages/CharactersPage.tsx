import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { characterApi } from '@/services/api'
import type { Character } from '@/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ArrowLeft, Plus, Pencil, Trash2, X } from 'lucide-react'

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

export default function CharactersPage() {
  const [characters, setCharacters] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    system_prompt: '',
    avatar_url: '',
    response_language: 'thai',
  })

  useEffect(() => {
    loadCharacters()
  }, [])

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingId) {
        await characterApi.update(editingId, formData)
      } else {
        await characterApi.create({ ...formData, is_active: true })
      }
      setShowForm(false)
      setEditingId(null)
      setFormData({ name: '', description: '', system_prompt: '', avatar_url: '', response_language: 'thai' })
      loadCharacters()
    } catch {
      console.error('Failed to save character')
    }
  }

  const handleEdit = (char: Character) => {
    setEditingId(char.id)
    setFormData({
      name: char.name,
      description: char.description,
      system_prompt: char.system_prompt,
      avatar_url: char.avatar_url,
      response_language: (char as any).response_language || 'thai',
    })
    setShowForm(true)
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

  const handleCancel = () => {
    setShowForm(false)
    setEditingId(null)
    setFormData({ name: '', description: '', system_prompt: '', avatar_url: '', response_language: 'thai' })
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/chat" className="text-text-muted hover:text-text transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Characters</h1>
              <p className="text-text-muted">Manage your AI VTuber characters</p>
            </div>
          </div>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Character
          </Button>
        </div>

        {/* Form */}
        {showForm && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{editingId ? 'Edit Character' : 'New Character'}</CardTitle>
                <Button variant="ghost" size="icon" onClick={handleCancel}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Name</label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Character name"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Avatar URL</label>
                    <Input
                      value={formData.avatar_url}
                      onChange={(e) => setFormData({ ...formData, avatar_url: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Description</label>
                  <Input
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Short description"
                  />
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

                <div className="space-y-2">
                  <label className="text-sm font-medium">Response Language</label>
                  <select
                    value={formData.response_language}
                    onChange={(e) => setFormData({ ...formData, response_language: e.target.value })}
                    className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {LANGUAGES.map((lang) => (
                      <option key={lang.value} value={lang.value}>{lang.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-text-muted">ภาษาที่ตัวละครจะใช้ตอบกลับเท่านั้น</p>
                </div>

                <div className="flex gap-3">
                  <Button type="submit">
                    {editingId ? 'Update' : 'Create'}
                  </Button>
                  <Button type="button" variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Characters List */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-text-muted">Loading characters...</p>
          </div>
        ) : characters.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center py-12">
              <p className="text-text-muted">No characters yet. Create your first one!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {characters.map((char) => (
              <Card key={char.id} className="hover:border-primary/50 transition-colors">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold text-lg">
                        {char.name[0]}
                      </div>
                      <div>
                        <CardTitle className="text-base">{char.name}</CardTitle>
                        <CardDescription className="text-xs">{char.description}</CardDescription>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(char)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(char.id)}>
                        <Trash2 className="h-4 w-4 text-error" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-text-muted line-clamp-2">{char.system_prompt}</p>
                  <p className="text-xs text-primary mt-2">
                    🌐 {(LANGUAGES.find(l => l.value === (char as any).response_language)?.label) || '🇹🇭 ไทย (Thai)'}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
