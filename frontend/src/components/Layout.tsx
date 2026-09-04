import { Link, useLocation, Outlet } from 'react-router-dom'
import { MessageSquare, Sparkles, Settings, Bot } from 'lucide-react'

const NAV_ITEMS = [
  { path: '/chat', label: 'Chat', icon: MessageSquare },
  { path: '/characters', label: 'Characters', icon: Sparkles },
  { path: '/settings', label: 'Provider Settings', icon: Settings },
]

export default function Layout() {
  const location = useLocation()

  const isActivePath = (path: string) => {
    if (path === '/chat') return location.pathname === '/chat'
    if (path === '/characters') return location.pathname.startsWith('/characters')
    if (path === '/settings') return location.pathname === '/settings'
    return false
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Fixed Top Navigation */}
      <header className="h-14 border-b border-border bg-surface px-6 flex items-center justify-between flex-shrink-0 z-40">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <span className="font-semibold text-text">MENA AI VTuber</span>
        </Link>

        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = isActivePath(item.path)
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-primary/20 text-primary'
                    : 'text-text-muted hover:bg-surface-light hover:text-text'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </header>

      {/* Page Content */}
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
