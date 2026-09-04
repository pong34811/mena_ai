import { useState, useRef, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { chatApi, characterApi, youtubeChatApi, ttsApi } from '@/services/api'
import type { Character } from '@/types'
import type { YouTubeChatSession } from '@/services/api'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Send, User, Bot, ArrowLeft, Play, Square, Zap, Video, Volume2, VolumeX, Loader2 } from 'lucide-react'

interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  author?: string
  isSuperChat?: boolean
  isMod?: boolean
  isOwner?: boolean
  isYouTube?: boolean
  aiResponse?: string
}

export default function ChatPage() {
  const [characters, setCharacters] = useState<Character[]>([])
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null)
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [input, setInput] = useState('')
  const [userName, setUserName] = useState(() => localStorage.getItem('mena_user_name') || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // YouTube Live Chat state
  const [ytVideoUrl, setYtVideoUrl] = useState('')
  const [ytSession, setYtSession] = useState<YouTubeChatSession | null>(null)
  const [ytAutoReply, setYtAutoReply] = useState(false)
  const [ytConnecting, setYtConnecting] = useState(false)
  const [showYtPanel, setShowYtPanel] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const ytPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // TTS state
  const [ttsEnabled, setTtsEnabled] = useState(() => localStorage.getItem('mena_tts_enabled') === 'true')
  const [ttsLoading, setTtsLoading] = useState<string | null>(null)
  const [ttsVoice, setTtsVoice] = useState(() => localStorage.getItem('mena_tts_voice') || 'th-TH-PremwadeeNeural')
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    loadCharacters()
    checkExistingYtSession()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Poll YouTube messages when session is active
  useEffect(() => {
    if (ytSession && ytSession.status === 'active') {
      ytPollRef.current = setInterval(fetchYtMessages, 2000)
      fetchYtMessages()
    } else if (ytPollRef.current) {
      clearInterval(ytPollRef.current)
      ytPollRef.current = null
    }
    return () => {
      if (ytPollRef.current) clearInterval(ytPollRef.current)
    }
  }, [ytSession?.id, ytSession?.status])

  const loadCharacters = async () => {
    try {
      const data = await characterApi.getAll()
      setCharacters(data)
      if (data.length > 0) setSelectedCharacter(data[0])
    } catch {
      setError('Failed to load characters')
    }
  }

  const checkExistingYtSession = async () => {
    try {
      const status = await youtubeChatApi.getStatus()
      if ('active' in status && status.active === false) return
      if ('id' in status) {
        setYtSession(status as YouTubeChatSession)
        setShowYtPanel(true)
      }
    } catch {
      // No existing session
    }
  }

  const fetchYtMessages = useCallback(async () => {
    if (!ytSession) return
    try {
      const data = await youtubeChatApi.getMessages(ytSession.id)
      const ytMsgs = data.results || []
      
      // Convert YouTube messages to display messages
      const newMessages: DisplayMessage[] = []
      for (const ytMsg of ytMsgs) {
        // YouTube user message
        newMessages.push({
          id: `yt-${ytMsg.id}`,
          role: 'user',
          content: ytMsg.text,
          timestamp: new Date(ytMsg.received_at),
          author: ytMsg.author_name,
          isSuperChat: ytMsg.is_super_chat,
          isMod: ytMsg.is_mod,
          isOwner: ytMsg.is_owner,
          isYouTube: true,
        })
        // AI response if available
        if (ytMsg.ai_responded && ytMsg.ai_response) {
          newMessages.push({
            id: `yt-ai-${ytMsg.id}`,
            role: 'assistant',
            content: ytMsg.ai_response,
            timestamp: new Date(ytMsg.received_at),
            isYouTube: true,
          })
        }
      }
      
      setMessages((prev) => {
        // Merge with existing messages, avoid duplicates
        const existingIds = new Set(prev.map(m => m.id))
        const merged = [...prev]
        for (const msg of newMessages) {
          if (!existingIds.has(msg.id)) {
            merged.push(msg)
          }
        }
        // Sort by timestamp
        merged.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
        return merged.slice(-100) // Keep last 100 messages
      })
    } catch {
      // Ignore poll errors
    }
  }, [ytSession?.id])

  const extractVideoId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
      /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/,
    ]
    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match) return match[1]
    }
    return null
  }

  // TTS functions
  const playTTS = async (text: string, messageId: string) => {
    if (!ttsEnabled || !text.trim()) return
    setTtsLoading(messageId)
    try {
      const blob = await ttsApi.chatMessage(text, selectedCharacter?.id, ttsVoice)
      const url = URL.createObjectURL(blob)
      if (audioRef.current) {
        audioRef.current.pause()
      }
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => {
        URL.revokeObjectURL(url)
        setTtsLoading(null)
      }
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        setTtsLoading(null)
      }
      await audio.play()
    } catch (err) {
      console.error('TTS error:', err)
      setTtsLoading(null)
    }
  }

  const toggleTTSEnabled = () => {
    const newValue = !ttsEnabled
    setTtsEnabled(newValue)
    localStorage.setItem('mena_tts_enabled', String(newValue))
    if (!newValue && audioRef.current) {
      audioRef.current.pause()
    }
  }

  const handleVoiceChange = (voiceId: string) => {
    setTtsVoice(voiceId)
    localStorage.setItem('mena_tts_voice', voiceId)
  }

  const handleStartYoutube = async () => {
    const videoId = extractVideoId(ytVideoUrl.trim())
    if (!videoId) {
      setError('Invalid YouTube URL. Example: https://www.youtube.com/watch?v=Af7pRKJYFE0')
      return
    }

    setYtConnecting(true)
    setError(null)
    try {
      const session = await youtubeChatApi.startSession(
        videoId,
        selectedCharacter?.id,
        ytAutoReply
      )
      setYtSession(session)
      setShowYtPanel(true)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start YouTube chat session')
    } finally {
      setYtConnecting(false)
    }
  }

  const handleStopYoutube = async () => {
    try {
      await youtubeChatApi.stopSession()
      setYtSession(null)
    } catch {
      setError('Failed to stop YouTube chat session')
    }
  }

  const handleSend = async () => {
    if (!input.trim() || loading || !selectedCharacter) return

    const userMessage: DisplayMessage = {
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
        user_name: userName,
      })

      const assistantMessage: DisplayMessage = {
        id: response.message_id,
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])

      // Auto-play TTS if enabled
      if (ttsEnabled && response.response) {
        playTTS(response.response, response.message_id)
      }
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

  const getAvatarContent = (msg: DisplayMessage) => {
    if (msg.role === 'assistant') {
      return <Bot className="h-4 w-4" />
    }
    if (msg.isYouTube && msg.author) {
      return msg.author.charAt(1).toUpperCase() // @username -> U
    }
    return <User className="h-4 w-4" />
  }

  const getAvatarStyle = (msg: DisplayMessage) => {
    if (msg.role === 'assistant') {
      return 'bg-gradient-to-br from-primary to-secondary text-white'
    }
    if (msg.isYouTube) {
      return 'bg-red-500/20 border border-red-500/50 text-red-400'
    }
    return 'bg-surface-light'
  }

  const getBubbleStyle = (msg: DisplayMessage) => {
    if (msg.role === 'user') {
      return 'bg-primary text-white rounded-br-md'
    }
    return 'bg-surface-light border border-border rounded-bl-md'
  }

  const getTimeString = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
                onClick={() => setSelectedCharacter(char)}
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

        {/* YouTube Live Chat Section */}
        <div className="p-4 border-t border-border">
          <button
            onClick={() => setShowYtPanel(!showYtPanel)}
            className="w-full flex items-center gap-2 text-sm font-semibold text-text-muted uppercase tracking-wider mb-3 hover:text-text transition-colors"
          >
            <Video className="h-4 w-4 text-red-500" />
            YouTube Live Chat
            {ytSession && (
              <span className="ml-auto h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            )}
          </button>

          {showYtPanel && (
            <div className="space-y-3">
              {!ytSession ? (
                <>
                  <Input
                    value={ytVideoUrl}
                    onChange={(e) => setYtVideoUrl(e.target.value)}
                    placeholder="YouTube URL or Video ID"
                    className="text-xs"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="autoReply"
                      checked={ytAutoReply}
                      onChange={(e) => setYtAutoReply(e.target.checked)}
                      className="rounded border-border"
                    />
                    <label htmlFor="autoReply" className="text-xs text-text-muted">
                      Auto-reply
                    </label>
                  </div>
                  <Button
                    onClick={handleStartYoutube}
                    disabled={!ytVideoUrl.trim() || ytConnecting}
                    size="sm"
                    className="w-full"
                  >
                    {ytConnecting ? (
                      <>Connecting...</>
                    ) : (
                      <>
                        <Play className="h-3 w-3 mr-1" />
                        Connect
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <>
                  <div className="bg-surface-light rounded-lg p-2 text-xs space-y-1">
                    <div className="flex items-center gap-1 text-green-500">
                      <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                      Connected
                    </div>
                    <div className="text-text-muted truncate">
                      Video: {ytSession.video_id}
                    </div>
                    <div className="text-text-muted">
                      Messages: {ytSession.messages_received}
                    </div>
                    {ytSession.auto_reply && (
                      <div className="text-text-muted">
                        Replies: {ytSession.replies_sent}
                      </div>
                    )}
                  </div>
                  <Button
                    onClick={handleStopYoutube}
                    variant="destructive"
                    size="sm"
                    className="w-full"
                  >
                    <Square className="h-3 w-3 mr-1" />
                    Disconnect
                  </Button>
                </>
              )}
            </div>
          )}
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
        {/* TTS Controls Header */}
        {selectedCharacter && (
          <header className="h-14 border-b border-border bg-surface px-6 flex items-center justify-end gap-2">
            <select
              value={ttsVoice}
              onChange={(e) => handleVoiceChange(e.target.value)}
              className="text-xs bg-surface-light border border-border rounded px-2 py-1 text-text-muted focus:outline-none focus:border-primary"
            >
              <optgroup label="Thai">
                <option value="th-TH-PremwadeeNeural">Thai Female (Premwadee)</option>
                <option value="th-TH-NiwatNeural">Thai Male (Niwat)</option>
              </optgroup>
              <optgroup label="English">
                <option value="en-US-AriaNeural">US Aria (Female)</option>
                <option value="en-US-GuyNeural">US Guy (Male)</option>
                <option value="en-US-JennyNeural">US Jenny (Female)</option>
                <option value="en-US-MichelleNeural">US Michelle (Female)</option>
                <option value="en-GB-SoniaNeural">UK Sonia (Female)</option>
                <option value="en-GB-RyanNeural">UK Ryan (Male)</option>
              </optgroup>
              <optgroup label="Japanese">
                <option value="ja-JP-NanamiNeural">JP Nanami (Female)</option>
                <option value="ja-JP-KeitaNeural">JP Keita (Male)</option>
              </optgroup>
            </select>
            <Button
              onClick={toggleTTSEnabled}
              variant={ttsEnabled ? 'default' : 'outline'}
              size="sm"
              className="flex items-center gap-1"
            >
              {ttsEnabled ? (
                <Volume2 className="h-3 w-3" />
              ) : (
                <VolumeX className="h-3 w-3" />
              )}
              <span className="text-xs">{ttsEnabled ? 'TTS On' : 'TTS Off'}</span>
            </Button>
            {ytSession && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-1.5">
                <Video className="h-4 w-4 text-red-500" />
                <span className="text-xs text-red-400 font-medium">LIVE</span>
                <span className="text-xs text-text-muted">{ytSession.messages_received} msgs</span>
              </div>
            )}
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
                  <p className="text-sm text-text-muted mb-3">
                    Say hello to {selectedCharacter.name} and begin your chat!
                  </p>
                  <p className="text-xs text-text-muted flex items-center justify-center gap-1">
                    <Video className="h-3 w-3 text-red-500" />
                    Or connect a YouTube live stream to auto-respond to chat
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === 'user' && !msg.isYouTube ? 'flex-row-reverse' : ''}`}
              >
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${getAvatarStyle(msg)}`}
                >
                  {getAvatarContent(msg)}
                </div>
                <div
                  className={`max-w-[70%] rounded-2xl px-4 py-3 ${getBubbleStyle(msg)}`}
                >
                  {/* Author label for YouTube messages */}
                  {msg.isYouTube && msg.author && (
                    <div className="flex items-center gap-2 mb-1">
                      {msg.isSuperChat && (
                        <Zap className="h-3 w-3 text-yellow-500" />
                      )}
                      {msg.isMod && (
                        <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">
                          MOD
                        </span>
                      )}
                      {msg.isOwner && (
                        <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">
                          OWNER
                        </span>
                      )}
                      <span className="text-xs font-medium text-red-400">
                        {msg.author}
                      </span>
                      <span className="text-[10px] text-red-400/60">via YouTube</span>
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className={`text-xs ${msg.role === 'user' && !msg.isYouTube ? 'text-white/70' : 'text-text-muted'}`}>
                      {getTimeString(msg.timestamp)}
                    </p>
                    {/* TTS button for assistant messages */}
                    {msg.role === 'assistant' && (
                      <button
                        onClick={() => playTTS(msg.content, msg.id)}
                        disabled={ttsLoading === msg.id}
                        className="text-text-muted hover:text-primary transition-colors p-1 rounded hover:bg-surface-light"
                        title="Play TTS"
                      >
                        {ttsLoading === msg.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Volume2 className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </div>
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
            <div className="max-w-4xl mx-auto space-y-2">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-text-muted" />
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => {
                    setUserName(e.target.value)
                    localStorage.setItem('mena_user_name', e.target.value)
                  }}
                  placeholder="Your name (for memory)"
                  className="text-xs bg-transparent border-b border-border focus:border-primary outline-none px-1 py-0.5 text-text-muted focus:text-text transition-colors w-48"
                />
              </div>
              <div className="flex gap-3">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={ytSession ? `Message ${selectedCharacter.name} or wait for YouTube chat...` : `Message ${selectedCharacter.name}...`}
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
          </div>
        )}
      </main>
    </div>
  )
}
