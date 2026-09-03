import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Bot, MessageSquare, Settings, Sparkles } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8 bg-gradient-to-b from-background via-surface to-background">
      <div className="max-w-2xl text-center space-y-8">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="h-24 w-24 rounded-3xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-xl shadow-primary/20">
            <Bot className="h-12 w-12 text-white" />
          </div>
        </div>

        {/* Title */}
        <div className="space-y-4">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-primary-light via-secondary to-accent bg-clip-text text-transparent">
            MENA AI VTuber
          </h1>
          <p className="text-xl text-text-muted">
            Chat with AI-powered VTubers — your virtual companion for entertainment and conversation.
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
          <Card className="hover:border-primary/50 transition-colors">
            <CardContent className="pt-6 text-center">
              <MessageSquare className="h-8 w-8 text-primary mx-auto mb-3" />
              <h3 className="font-semibold mb-1">Real-time Chat</h3>
              <p className="text-sm text-text-muted">Instant responses with conversation memory</p>
            </CardContent>
          </Card>

          <Card className="hover:border-primary/50 transition-colors">
            <CardContent className="pt-6 text-center">
              <Sparkles className="h-8 w-8 text-secondary mx-auto mb-3" />
              <h3 className="font-semibold mb-1">Unique Personalities</h3>
              <p className="text-sm text-text-muted">Each character has their own style</p>
            </CardContent>
          </Card>

          <Card className="hover:border-primary/50 transition-colors">
            <CardContent className="pt-6 text-center">
              <Settings className="h-8 w-8 text-accent mx-auto mb-3" />
              <h3 className="font-semibold mb-1">Customizable</h3>
              <p className="text-sm text-text-muted">Configure your own AI providers</p>
            </CardContent>
          </Card>
        </div>

        {/* CTA */}
        <div className="flex justify-center gap-4 pt-4">
          <Link to="/chat">
            <Button size="lg">
              Start Chatting
            </Button>
          </Link>
          <Link to="/settings">
            <Button variant="outline" size="lg">
              Configure
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
