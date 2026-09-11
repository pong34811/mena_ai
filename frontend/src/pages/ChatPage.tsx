import { useState, useRef, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { chatApi, characterApi, youtubeChatApi } from '@/services/api'
import type { Character } from '@/types'
import type { YouTubeChatSession } from '@/services/api'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Send, User, Bot, ArrowLeft, Play, Square, Zap, Video, Volume2, VolumeX, SkipForward, MessageSquare, Sparkles, Settings, Cog } from 'lucide-react'
import { useHowlerTTS } from '@/hooks/useHowlerTTS'
import { useChatWebSocket } from '@/hooks/useChatWebSocket'
import { useYouTubeWebSocket } from '@/hooks/useYouTubeWebSocket'
import { TtsConfigModal } from '@/components/ui/TtsConfigModal'

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
}

export default function ChatPage() {
  const [characters, setCharacters] = useState<Character[]>([])
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null)
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [input, setInput] = useState('')
  const [userName, setUserName] = useState(() => localStorage.getItem('mena_user_name') || 'Dev')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // YouTube Live Chat state
  const [ytVideoUrl, setYtVideoUrl] = useState('')
  const [ytSession, setYtSession] = useState<YouTubeChatSession | null>(null)
  const [ytAutoReply, setYtAutoReply] = useState(true)
  const [ytConnecting, setYtConnecting] = useState(false)
  const [showYtPanel, setShowYtPanel] = useState(false)
  // Live counters derived from the yt-messages feed (same source as the list).
  const [ytCounts, setYtCounts] = useState({ messages: 0, replies: 0 })
  const ytSeenMsgIds = useRef<Set<string>>(new Set())

  const messagesEndRef = useRef<HTMLDivElement>(null)
  // Streaming message being built token-by-token
  const [streamMsg, setStreamMsg] = useState<{ id: string; content: string } | null>(null)
  // Capture the user's original message so WebSocket onDone can speak it
  const lastUserMsgRef = useRef<string>('')

  // TTS Hook (client-side Howler)
  const tts = useHowlerTTS()
  const ttsEnabled = tts.settings?.questioner_enabled || tts.settings?.responder_enabled || false

  // YouTube WebSocket — replaces the old polling loop
  useYouTubeWebSocket({
    enabled: !!ytSession,
    onMessage: useCallback((event) => {
      if (!event.id || ytSeenMsgIds.current.has(event.id)) return
      ytSeenMsgIds.current.add(event.id)
      setYtCounts((prev) => ({ ...prev, messages: prev.messages + 1 }))

      const userMsg: DisplayMessage = {
        id: `yt-${event.id}`,
        role: 'user',
        content: event.text || '',
        timestamp: new Date(event.received_at || Date.now()),
        author: event.author_name,
        isSuperChat: event.is_super_chat,
        isMod: event.is_mod,
        isOwner: event.is_owner,
        isYouTube: true,
      }
      setMessages((prev) => {
        if (prev.some((m) => m.id === userMsg.id)) return prev
        const merged = [...prev, userMsg]
        merged.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
        return merged.slice(-100)
      })

      // Speak the viewer message (questioner)
      tts.speakExchange({
        questioner_text: event.text || '',
        questioner_author: event.author_name,
        responder_text: event.ai_responded ? event.ai_response || '' : '',
        source: 'youtube',
        source_id: event.id,
      })

      // If AI already replied, add the assistant message too
      if (event.ai_responded && event.ai_response) {
        const aiMsg: DisplayMessage = {
          id: `yt-ai-${event.id}`,
          role: 'assistant',
          content: event.ai_response,
          timestamp: new Date(event.received_at || Date.now()),
          isYouTube: true,
        }
        setMessages((prev) => {
          if (prev.some((m) => m.id === aiMsg.id)) return prev
          const merged = [...prev, aiMsg]
          merged.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
          return merged.slice(-100)
        })
      }
    }, [tts]),
    onReply: useCallback((event) => {
      if (!event.id) return
      setYtCounts((prev) => ({ ...prev, replies: prev.replies + 1 }))

      const aiMsg: DisplayMessage = {
        id: `yt-ai-${event.id}`,
        role: 'assistant',
        content: event.ai_response || '',
        timestamp: new Date(),
        isYouTube: true,
      }
      setMessages((prev) => {
        if (prev.some((m) => m.id === aiMsg.id)) return prev
        const merged = [...prev, aiMsg]
        merged.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
        return merged.slice(-100)
      })

      // Speak the AI reply (responder) — questioner was already spoken when
      // the original message arrived, so we only enqueue the responder here.
      tts.speakExchange({
        questioner_text: '',
        questioner_author: '',
        responder_text: event.ai_response || '',
        source: 'youtube',
        source_id: event.id,
      })
    }, [tts]),
  })

  // TTS Config Modal state
  const [showTtsModal, setShowTtsModal] = useState(false)

  // WebSocket streaming
  useChatWebSocket({
    onToken: useCallback((token: string) => {
      setStreamMsg(prev => prev ? { ...prev, content: prev.content + token } : null)
    }, []),
    onDone: useCallback((messageId: string, content?: string) => {
      setStreamMsg(prev => {
        if (!prev) return null
        // Commit streaming message to messages list — prefer the server's
        // enforced final text (language/length checked) when provided.
        const id = messageId || prev.id
        const contentText = content || prev.content
        setMessages(m => {
          // Guard against duplicate done events (e.g. WebSocket reconnection)
          if (m.some(msg => msg.id === id)) return m
          return [...m, {
            id,
            role: 'assistant' as const,
            content: contentText,
            timestamp: new Date(),
          }]
        })
        // Speak the exchange — use the user's original message + AI reply
        tts.speakExchange({
          questioner_text: lastUserMsgRef.current || '',
          questioner_author: userName || 'You',
          responder_text: contentText,
          source: 'chat',
          source_id: id,
        })
        lastUserMsgRef.current = ''
        return null
      })
    }, [tts, userName]),
    onError: useCallback((error: string) => {
      setStreamMsg(null)
      setError(error)
    }, []),
  })

  useEffect(() => {
    loadCharacters()
    checkExistingYtSession()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Reset live counters whenever the watched session changes.
  useEffect(() => {
    ytSeenMsgIds.current = new Set()
    setYtCounts({ messages: 0, replies: 0 })
  }, [ytSession?.id])

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
  const updateTts = async (patch: Record<string, unknown>) => {
    await fetch('/api/tts/settings/update/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    await tts.reloadSettings()
  }

  const toggleTTSEnabled = async () => {
    const newValue = !ttsEnabled
    try {
      await updateTts({ questioner_enabled: newValue, responder_enabled: newValue })
      if (newValue) {
        await tts.unlockAudio()
      } else {
        tts.clearQueue()
      }
    } catch (err) {
      console.error('Failed to toggle TTS:', err)
    }
  }


  const handleSend = async () => {
    if (!input.trim() || !selectedCharacter) return

    const userMessage: DisplayMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    lastUserMsgRef.current = input.trim()
    setInput('')
    setError(null)

    // Force HTTP for now — WebSocket is unstable (reconnect loop)
    // Try WebSocket streaming first, fall back to HTTP
    // const sent = ws.sendChat(selectedCharacter.id, userMessage.content, userName)
    // if (sent) {
    //   setStreamMsg({ id: `stream-${Date.now()}`, content: '' })
    //   return
    // }

    // HTTP fallback
    setLoading(true)
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

      tts.speakExchange({
        questioner_text: userMessage.content,
        questioner_author: userName || 'You',
        responder_text: response.response,
        source: 'chat',
        source_id: response.message_id,
      })
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
      return msg.author.charAt(1).toUpperCase()
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
                <div
                  className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-semibold"
                  style={char.avatar_border_color ? { borderColor: char.avatar_border_color, borderWidth: 2, borderStyle: 'solid' } : undefined}
                >
                  {(char.name_th || char.name)[0]}
                </div>
                <div className="text-left">
                  <div className="font-medium text-sm">{char.name_th || char.name}</div>
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
                      Messages: {ytCounts.messages}
                    </div>
                    {ytSession.auto_reply && (
                      <div className="text-text-muted">
                        Replies: {ytCounts.replies}
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
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header with Navigation */}
        <header className="h-14 border-b border-border bg-surface px-6 flex items-center justify-between gap-4 min-w-0 overflow-hidden">
          <nav className="flex items-center gap-1">
            <Link to="/chat" className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary/20 text-primary">
              <MessageSquare className="h-4 w-4" />
              <span>Chat</span>
            </Link>
            <Link to="/characters" className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg text-text-muted hover:bg-surface-light hover:text-text">
              <Sparkles className="h-4 w-4" />
              <span>Characters</span>
            </Link>
            <Link to="/settings" className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg text-text-muted hover:bg-surface-light hover:text-text">
              <Settings className="h-4 w-4" />
              <span>Provider Settings</span>
            </Link>
            <Link to="/tts-settings" className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg text-text-muted hover:bg-surface-light hover:text-text">
              <Settings className="h-4 w-4" />
              <span>TTS Settings</span>
            </Link>
          </nav>
          <div className="flex items-center gap-2">
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
            <Button
              onClick={() => setShowTtsModal(true)}
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="TTS Voice Settings"
            >
              <Cog className="h-3.5 w-3.5" />
            </Button>
            {ytSession && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-1.5">
                <Video className="h-4 w-4 text-red-500" />
                <span className="text-xs text-red-400 font-medium">LIVE</span>
                <span className="text-xs text-text-muted">{ytCounts.messages} msgs</span>
              </div>
            )}
          </div>
        </header>

        {/* TTS Status Bar — show what is currently being spoken */}
        {tts.currentItem && (
          <div className="flex items-center justify-between gap-3 border-b border-border bg-surface/70 px-6 py-2 overflow-hidden min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
              {tts.currentItem.type === 'questioner' ? (
                <User className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
              ) : (
                <Bot className="h-3.5 w-3.5 text-primary flex-shrink-0" />
              )}
              {tts.currentItem.type === 'questioner' ? (
                <>
                  <span className="text-text-muted flex-shrink-0">🔊 ผู้ถาม:</span>
                  <span className="text-text truncate min-w-0">
                    {tts.currentItem.author_name
                      ? `${tts.currentItem.author_name}: ${tts.currentItem.text}`
                      : tts.currentItem.text}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-text-muted flex-shrink-0">🔊 ผู้ตอบ:</span>
                  <span className="text-text truncate min-w-0">{tts.currentItem.text}</span>
                </>
              )}
            </div>
            <Button
              onClick={() => tts.skip()}
              variant="ghost"
              size="sm"
              className="flex items-center gap-1 flex-shrink-0"
            >
              <SkipForward className="h-3.5 w-3.5" />
              <span className="text-xs">Skip</span>
            </Button>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-4 min-w-0">
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
                    Say hello to {selectedCharacter.name_th || selectedCharacter.name} and begin your chat!
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
                className={`flex gap-3 min-w-0 ${msg.role === 'user' && !msg.isYouTube ? 'flex-row-reverse' : ''}`}
              >
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${getAvatarStyle(msg)}`}
                >
                  {getAvatarContent(msg)}
                </div>
                <div
                  className={`max-w-[70%] min-w-0 break-words rounded-2xl px-4 py-3 ${getBubbleStyle(msg)}`}
                >
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
                  {msg.role === 'user' && !msg.isYouTube && userName && (
                    <div className="mb-1">
                      <span className="text-xs font-medium text-white/90">
                        {userName}
                      </span>
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.content}</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className={`text-xs ${msg.role === 'user' && !msg.isYouTube ? 'text-white/70' : 'text-text-muted'}`}>
                      {getTimeString(msg.timestamp)}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}

          {loading && !streamMsg && (
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

          {streamMsg && (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div className="bg-surface-light border border-border rounded-2xl rounded-bl-md px-4 py-3 max-w-[70%] min-w-0 break-words">
                <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{streamMsg.content}<span className="animate-pulse">|</span></p>
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
                  placeholder={ytSession ? `Message ${selectedCharacter.name_th || selectedCharacter.name} or wait for YouTube chat...` : `Message ${selectedCharacter.name_th || selectedCharacter.name}...`}
                  disabled={loading}
                  className="flex-1"
                />
                <Button
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  size="icon"
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>

      <TtsConfigModal
        isOpen={showTtsModal}
        onClose={() => setShowTtsModal(false)}
        userTtsEnabled={tts.settings?.questioner_enabled ?? false}
        setUserTtsEnabled={(v) => updateTts({ questioner_enabled: v })}
        userTtsVoice={tts.settings?.questioner_voice ?? 'th_TH-tsync2-medium'}
        setUserTtsVoice={(v) => updateTts({ questioner_voice: v })}
        aiTtsEnabled={tts.settings?.responder_enabled ?? false}
        setAiTtsEnabled={(v) => updateTts({ responder_enabled: v })}
        aiTtsVoice={tts.settings?.responder_voice ?? 'th_TH-tsync2-medium'}
        setAiTtsVoice={(v) => updateTts({ responder_voice: v })}
      />
    </div>
  )
}
