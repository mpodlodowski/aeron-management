import { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { useClusterStore } from './stores/clusterStore'
import Dashboard from './pages/Dashboard'
import NodeDetail from './pages/NodeDetail'
import Archive from './pages/Archive'

function PageTitle() {
  const location = useLocation()
  const nodes = useClusterStore((s) => s.nodes)

  if (location.pathname === '/') return <>Dashboard</>
  if (location.pathname === '/archive') return <>Archive</>

  const match = location.pathname.match(/^\/nodes\/(-?\d+)$/)
  if (match) {
    const id = Number(match[1])
    const metrics = nodes.get(id)
    const agentDown = metrics?.agentConnected === false
    const noCnc = !agentDown && metrics?.cncAccessible === false
    const nodeDown = !agentDown && !noCnc && metrics?.nodeReachable === false
    const isBackup = metrics?.agentMode === 'backup'
    const name = isBackup ? 'Backup' : `Node ${id}`

    if (agentDown) return <>{name} <RoleBadge role="OFFLINE" /></>
    if (noCnc) return <>{name} <RoleBadge role="DETACHED" /></>
    if (nodeDown) return <>{name} <RoleBadge role="DOWN" /></>

    const role = isBackup ? 'BACKUP' : (metrics?.clusterMetrics?.nodeRole ?? 'UNKNOWN')
    return <>{name} <RoleBadge role={role} /></>
  }

  return null
}

function RoleBadge({ role }: { role: string }) {
  const color = role === 'OFFLINE' ? 'bg-gray-500' :
    role === 'DETACHED' ? 'bg-yellow-500' :
    role === 'DOWN' ? 'bg-red-500' :
    role === 'BACKUP' ? 'bg-purple-500' :
    role === 'LEADER' ? 'bg-green-500' :
    role === 'FOLLOWER' ? 'bg-blue-500' :
    role === 'CANDIDATE' ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color} text-white align-middle`}>
      {role}
    </span>
  )
}

function AuthBadge() {
  const [username, setUsername] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.authenticated) setUsername(data.username)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (!username) return null

  const handleLogout = async () => {
    document.documentElement.style.visibility = 'hidden'
    await fetch('/api/auth/logout', { method: 'POST' })
    // Clear browser's cached Basic auth credentials by sending wrong ones
    try {
      await fetch('/api/auth/me', {
        headers: { 'Authorization': 'Basic ' + btoa('_:_') }
      })
    } catch {}
    window.location.reload()
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="h-7 w-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center hover:bg-blue-500 transition-colors"
        title={username}
      >
        {username[0].toUpperCase()}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg py-1 min-w-[140px] z-50">
          <div className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-700">{username}</div>
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
          >
            Logout
          </button>
        </div>
      )}
    </div>
  )
}

function Header() {
  const location = useLocation()
  const isHome = location.pathname === '/'
  const connected = useClusterStore((s) => s.connected)

  return (
    <header className="border-b border-gray-800 px-6 py-3 flex items-center gap-4">
      <div className="w-6">
        {!isHome && (
          <Link to="/" className="text-gray-400 hover:text-gray-200 transition-colors">
            &larr;
          </Link>
        )}
      </div>
      <Link to="/" className="text-lg font-semibold hover:text-gray-200 transition-colors">
        Aeron Management
      </Link>
      <span className="text-gray-600">|</span>
      <span className="text-sm text-gray-300">
        <PageTitle />
      </span>
      <nav className="ml-auto flex items-center gap-4 text-sm">
        <Link
          to="/"
          className={`transition-colors ${location.pathname === '/' ? 'text-gray-200' : 'text-gray-400 hover:text-gray-200'}`}
        >
          Dashboard
        </Link>
        <Link
          to="/archive"
          className={`transition-colors ${location.pathname === '/archive' ? 'text-gray-200' : 'text-gray-400 hover:text-gray-200'}`}
        >
          Archive
        </Link>
        <span
          className={`inline-block h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
          title={connected ? 'WebSocket connected' : 'WebSocket disconnected'}
        />
        <AuthBadge />
      </nav>
    </header>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <Header />
        <main className="p-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/nodes/:nodeId" element={<NodeDetail />} />
            <Route path="/archive" element={<Archive />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
