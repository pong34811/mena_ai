import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { chatApi, characterApi } from '@/services/api'
import type { Character } from '@/types'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Send, User, Bot, ArrowLeft } from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export default function ChatPage() {
  const [characters, setCharacters] = useState<Character[]>([])
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadCharacters()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadCharacters = async () => {
    try {
      const data = await characterApi.getAll()
      setCharacters(data)
      if (data.length > 0) setSelectedCharacter(data[0])
    } catch {
      setError('Failed to load characters')
    }
  }

  const handleSend = async () => {
    if (!input.trim() || loading || !selectedCharacter) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const response = await chatApi.sendMessage({
        character_id: selectedCharacter.id,
        message: userMessage.content,
      })

      const assistantMessage: Message = {
        id: response.message_id,
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send message')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-72 border-r border-border bg-surface flex flex-col">
        <div className="p-4 border-b border-border">
          <Link to="/" className="flex items-center gap-2 text-text-muted hover:text-text transition-colors">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm">Back to Home</span>
          </Link>
        </div>

        <div className="p-4">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">Characters</h2>
          <div className="space-y-2">
            {characters.map((char) => (
              <button
                key={char.id}
                onClick={() => {
                  setSelectedCharacter(char)
                  setMessages([])
                }}
                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${
                  selectedCharacter?.id === char.id
                    ? 'bg-primary/20 border border-primary/50'
                    : 'hover:bg-surface-light border border-transparent'
                }`}
              >
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-semibold">
                  {char.name[0]}
                </div>
                <div className="text-left">
                  <div className="font-medium text-sm">{char.name}</div>
                  <div className="text-xs text-text-muted truncate max-w-[160px]">{char.description}</div>
                </div>
              </button>
            ))}
            {characters.length === 0 && (
              <p className="text-sm text-text-muted text-center py-4">No characters yet</p>
            )}
          </div>
        </div>

        <div className="mt-auto p-4 border-t border-border">
          <Link to="/characters">
            <Button variant="outline" className="w-full" size="sm">
              Manage Characters
            </Button>
          </Link>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col">
        {/* Chat Header */}
        {selectedCharacter && (
          <header className="h-16 border-b border-border bg-surface px-6 flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-semibold">
              {selectedCharacter.name[0]}
            </div>
            <div>
              <h2 className="font-semibold">{selectedCharacter.name}</h2>
              <p className="text-xs text-text-muted">{selectedCharacter.description}</p>
            </div>
          </header>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {!selectedCharacter ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-text-muted">Select a character to start chatting</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <Card className="max-w-md">
                <CardContent className="pt-6 text-center">
                  <Bot className="h-12 w-12 text-primary mx-auto mb-4" />
                  <h3 className="font-semibold text-lg mb-2">Start a conversation</h3>
                  <p className="text-sm text-text-muted">
                    Say hello to {selectedCharacter.name} and begin your chat!
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    msg.role === 'user'
                      ? 'bg-surface-light'
                      : 'bg-gradient-to-br from-primary to-secondary text-white'
                  }`}
                >
                  {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
                <div
                  className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-primary text-white rounded-br-md'
                      : 'bg-surface-light border border-border rounded-bl-md'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-white/70' : 'text-text-muted'}`}>
                    {msg.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div className="bg-surface-light border border-border rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-2 w-2 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-2 w-2 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-error/10 border border-error/50 rounded-lg p-3 text-sm text-error">
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        {selectedCharacter && (
          <div className="border-t border-border bg-surface p-4">
            <div className="flex gap-3 max-w-4xl mx-auto">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${selectedCharacter.name}...`}
                disabled={loading}
                className="flex-1"
              />
              <Button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
