import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { characterApi } from '@/services/api'
import type { Character } from '@/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ArrowLeft, Plus, Pencil, Trash2, X, Sparkles } from 'lucide-react'

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
  const isNew = window.location.pathname === '/characters/new'
  const isEdit = !!editId
  const showForm = isNew || isEdit

  const [characters, setCharacters] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)
  const [formData, setFormData] = useState(emptyForm)

  // AI Prompt Modal state
  const [showAiModal, setShowAiModal] = useState(false)
  const [aiPromptCharacter, setAiPromptCharacter] = useState<Character | null>(null)
  const [aiPromptText, setAiPromptText] = useState('')
  const [aiPromptLoading, setAiPromptLoading] = useState(false)
  const [aiPromptStats, setAiPromptStats] = useState<{ messages_analyzed: number; total_messages: number } | null>(null)

  useEffect(() => {
    loadCharacters()
  }, [])

  // Load character data when editing
  useEffect(() => {
    if (editId) {
      const char = characters.find(c => c.id === editId)
      if (char) {
        setFormData({
          name: char.name,
          name_th: char.name_th || '',
          name_en: char.name_en || '',
          description: char.description,
          system_prompt: char.system_prompt,
          avatar_url: char.avatar_url,
          response_language: (char as any).response_language || 'thai',
          response_length: (char as any).response_length || 'short',
          enable_per_user_memory: (char as any).enable_per_user_memory ?? true,
          memory_duration_days: (char as any).memory_duration_days ?? 3,
          system_prompt_ai: (char as any).system_prompt_ai || '',
        })
      }
    }
  }, [editId, characters])

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
      if (editId) {
        await characterApi.update(editId, formData)
      } else {
        await characterApi.create({ ...formData, is_active: true })
      }
      navigate('/characters')
    } catch {
      console.error('Failed to save character')
    }
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
    navigate('/characters')
  }

  const handleGenerateAiPrompt = async (char: Character) => {
    setAiPromptCharacter(char)
    setAiPromptText('')
    setAiPromptStats(null)
    setAiPromptLoading(true)
    setShowAiModal(true)

    try {
      const result = await characterApi.generatePrompt(char.id)
      setAiPromptText(result.system_prompt_ai)
      setAiPromptStats({ messages_analyzed: result.messages_analyzed, total_messages: result.total_messages })
    } catch (err: any) {
      setAiPromptText('Error: ' + (err.response?.data?.error || 'Failed to generate prompt'))
    } finally {
      setAiPromptLoading(false)
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
          <Button onClick={() => navigate('/characters/new')}>
            <Plus className="h-4 w-4 mr-2" />
            Add Character
          </Button>
        </div>

        {/* Form */}
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
                    <Input
                      value={formData.name_en}
                      onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
                      placeholder="e.g. Mena"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Name (Thai)</label>
                    <Input
                      value={formData.name_th}
                      onChange={(e) => setFormData({ ...formData, name_th: e.target.value })}
                      placeholder="e.g. มีนา"
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <label className="text-sm font-medium">Display Name</label>
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

                {/* AI-Generated Prompt Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">System Prompt AI</label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (editId) {
                          const char = characters.find(c => c.id === editId)
                          if (char) handleGenerateAiPrompt(char)
                        }
                      }}
                      disabled={!editId}
                    >
                      <Sparkles className="h-3 w-3 mr-1" />
                      Generate
                    </Button>
                  </div>
                  <textarea
                    value={formData.system_prompt_ai}
                    onChange={(e) => setFormData({ ...formData, system_prompt_ai: e.target.value })}
                    placeholder="AI-generated prompt based on chat history (click Generate to create)..."
                    rows={6}
                    className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary font-mono text-xs"
                  />
                  <p className="text-xs text-text-muted">AI สร้างจาก chat history — รวมกับ System Prompt ตอนคุย</p>
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

                <div className="space-y-2">
                  <label className="text-sm font-medium">ความยาวคำตอบ</label>
                  <select
                    value={formData.response_length}
                    onChange={(e) => setFormData({ ...formData, response_length: e.target.value as 'short' | 'normal' | 'long' | 'custom' })}
                    className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <option value="short">🎯 สั้น (1-2 ประโยค)</option>
                    <option value="normal">📝 ปกติ (2-4 ประโยค)</option>
                    <option value="long">📖 ยาว (เต็มที่)</option>
                    <option value="custom">⚙️ Custom</option>
                  </select>
                  <p className="text-xs text-text-muted">สั้น=เร็ว+ประหยัดโควต้า, ปกติ=สมดุล, ยาว=ละเอียด</p>
                </div>

                {/* Memory Settings */}
                <div className="space-y-3 pt-2 border-t border-border">
                  <h3 className="text-sm font-semibold text-text">🧠 Memory Settings</h3>
                  
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="enableMemory"
                      checked={formData.enable_per_user_memory}
                      onChange={(e) => setFormData({ ...formData, enable_per_user_memory: e.target.checked })}
                      className="rounded border-border"
                    />
                    <label htmlFor="enableMemory" className="text-sm text-text">
                      Enable per-user memory
                    </label>
                  </div>
                  <p className="text-xs text-text-muted">จำผู้ใช้แต่ละคนแยกกัน (ระบุชื่อผู้ใช้เพื่อเรียกใช้)</p>

                  {formData.enable_per_user_memory && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-text-muted">Memory duration (days)</label>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={formData.memory_duration_days}
                        onChange={(e) => setFormData({ ...formData, memory_duration_days: parseInt(e.target.value) || 3 })}
                        className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      />
                      <p className="text-xs text-text-muted">ระยะเวลาที่จะจำข้อความเดิมได้ (วัน)</p>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <Button type="submit">
                    {isEdit ? 'Update' : 'Create'}
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
                        {(char.name_th || char.name)[0]}
                      </div>
                      <div>
                        <CardTitle className="text-base">{char.name_th || char.name}</CardTitle>
                        <CardDescription className="text-xs">{char.description}</CardDescription>
                      </div>
                    </div>
                    <div className="flex gap-1">
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
                  <p className="text-xs text-text-muted line-clamp-2">{char.system_prompt}</p>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <p className="text-xs text-primary">
                      🌐 {(LANGUAGES.find(l => l.value === (char as any).response_language)?.label) || '🇹🇭 ไทย (Thai)'}
                    </p>
                    {(char as any).enable_per_user_memory !== false && (
                      <p className="text-xs text-secondary">
                        🧠 {(char as any).memory_duration_days || 3} วัน
                      </p>
                    )}
                    {(char as any).system_prompt_ai && (
                      <p className="text-xs text-accent">
                        ✨ AI Prompt
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* AI Prompt Modal */}
      {showAiModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-accent" />
                <h2 className="font-semibold">
                  System Prompt AI — {aiPromptCharacter?.name_th || aiPromptCharacter?.name}
                </h2>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowAiModal(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="p-4 flex-1 overflow-y-auto space-y-3">
              {aiPromptLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-sm text-text-muted">AI กำลังวิเคราะห์ chat history...</span>
                  </div>
                </div>
              ) : (
                <>
                  {aiPromptStats && (
                    <div className="bg-surface-light rounded-lg p-3 text-xs text-text-muted">
                      วิเคราะห์ {aiPromptStats.messages_analyzed} จาก {aiPromptStats.total_messages} ข้อความทั้งหมด
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">System Prompt AI</label>
                    <textarea
                      value={aiPromptText}
                      onChange={(e) => setAiPromptText(e.target.value)}
                      rows={15}
                      className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary font-mono"
                    />
                    <p className="text-xs text-text-muted">AI สร้างจาก chat history — รวมกับ System Prompt ตอนคุย</p>
                  </div>
                </>
              )}
            </div>
            
            <div className="p-4 border-t border-border flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowAiModal(false)}>
                ยกเลิก
              </Button>
              <Button onClick={handleSaveAiPrompt} disabled={aiPromptLoading || !aiPromptText.trim()}>
                บันทึก
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
