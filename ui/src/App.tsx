import { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate, useMatch } from 'react-router-dom'
import { useClusterStore } from './stores/clusterStore'
import { ClusterSummary } from './types'
import Cluster from './pages/Dashboard'
import NodeDetail from './pages/NodeDetail'
import Archive from './pages/Archive'
import Events from './pages/Events'
import { StatusBanner } from './components/StatusBanner'

function NodeBreadcrumb() {
  const match = useMatch('/clusters/:clusterId/nodes/:nodeId')
  const clusterId = match?.params.clusterId
  const nodes = useClusterStore((s) => s.clusters.get(clusterId ?? '')?.nodes ?? new Map())

  if (!match) return null

  const id = Number(match.params.nodeId)
  const metrics = nodes.get(id)
  const agentDown = metrics?.agentConnected === false
  const noCnc = !agentDown && metrics?.cncAccessible === false
  const nodeDown = !agentDown && !noCnc && metrics?.nodeReachable === false
  const isBackup = metrics?.agentMode === 'backup'
  const name = isBackup ? 'Backup' : `Node ${id}`

  const role = agentDown ? 'OFFLINE' :
    noCnc ? 'DETACHED' :
    nodeDown ? 'DOWN' :
    isBackup ? 'BACKUP' :
    (metrics?.clusterMetrics?.nodeRole ?? 'UNKNOWN')

  return (
    <>
      <span className="text-text-muted">/</span>
      <span className="text-sm text-text-secondary flex items-center gap-1.5">
        {name} <RoleBadge role={role} />
      </span>
    </>
  )
}

function RoleBadge({ role }: { role: string }) {
  const dotColor = role === 'OFFLINE' ? 'bg-text-muted' :
    role === 'DETACHED' ? 'bg-warning-text' :
    role === 'DOWN' ? 'bg-critical-text' :
    role === 'BACKUP' ? 'bg-role-backup' :
    role === 'LEADER' ? 'bg-success-text' :
    role === 'FOLLOWER' ? 'bg-info-text' :
    role === 'CANDIDATE' ? 'bg-warning-text' : 'bg-text-muted'
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary align-middle">
      <span className={`inline-block h-2 w-2 rounded-full ${dotColor}`} />
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
        className="h-7 w-7 rounded-full bg-info-fill text-white text-xs font-bold flex items-center justify-center hover:bg-info-fill/80 transition-colors"
        title={username}
      >
        {username[0].toUpperCase()}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-elevated border border-border-subtle rounded shadow-lg py-1 min-w-[140px] z-50">
          <div className="px-3 py-1.5 text-xs text-text-secondary border-b border-border-subtle">{username}</div>
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-1.5 text-sm text-text-primary hover:bg-elevated transition-colors"
          >
            Logout
          </button>
        </div>
      )}
    </div>
  )
}

function ClusterRedirect() {
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetch('/api/clusters')
      .then((res) => res.json())
      .then((clusters: ClusterSummary[]) => {
        if (clusters.length > 0) {
          navigate(`/clusters/${clusters[0].clusterId}`, { replace: true })
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [navigate])

  if (loading) return <div className="text-text-muted p-6">Loading clusters...</div>
  return <div className="text-text-muted p-6">No clusters connected. Waiting for agents...</div>
}

function ClusterSelector() {
  const navigate = useNavigate()
  const clusterList = useClusterStore((s) => s.clusterList)
  const match = useMatch('/clusters/:clusterId/*')
  const clusterId = match?.params.clusterId
  const subPath = match?.params['*'] ?? ''

  if (clusterList.length <= 1) return null

  return (
    <select
      value={clusterId ?? ''}
      onChange={(e) => {
        const path = subPath ? `/clusters/${e.target.value}/${subPath}` : `/clusters/${e.target.value}`
        navigate(path)
      }}
      className="bg-elevated text-text-primary text-sm rounded px-2 py-1 border border-border-subtle focus:outline-none focus:border-border-subtle"
    >
      {clusterList.map((c) => (
        <option key={c.clusterId} value={c.clusterId}>{c.clusterId}</option>
      ))}
    </select>
  )
}

function NavLink({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={`px-2 py-1 rounded transition-colors ${
        active
          ? 'text-text-primary bg-elevated'
          : 'text-text-secondary hover:text-text-primary'
      }`}
    >
      {children}
    </Link>
  )
}

function Header() {
  const match = useMatch('/clusters/:clusterId/*')
  const clusterId = match?.params.clusterId
  const subPath = match?.params['*'] ?? ''
  const connected = useClusterStore((s) => s.connected)

  const isCluster = !subPath || subPath.startsWith('nodes/')
  const isArchive = subPath === 'archive'
  const isEvents = subPath === 'events'

  return (
    <header className="border-b border-border-subtle px-6 py-3 flex items-center gap-3">
      <Link to={clusterId ? `/clusters/${clusterId}` : '/clusters'} className="text-lg font-semibold hover:text-text-primary transition-colors">
        Aeron Management
      </Link>
      <ClusterSelector />
      <NodeBreadcrumb />
      <nav className="ml-auto flex items-center gap-1 text-sm">
        <NavLink to={clusterId ? `/clusters/${clusterId}` : '/clusters'} active={isCluster}>
          Cluster
        </NavLink>
        <NavLink to={clusterId ? `/clusters/${clusterId}/archive` : '/clusters'} active={isArchive}>
          Archive
        </NavLink>
        <NavLink to={clusterId ? `/clusters/${clusterId}/events` : '/clusters'} active={isEvents}>
          Events
        </NavLink>
        <div className="ml-3 flex items-center gap-3">
          <AuthBadge />
          <span
            className={`inline-block h-2 w-2 rounded-full ${connected ? 'bg-success-text' : 'bg-critical-text'}`}
            title={connected ? 'WebSocket connected' : 'WebSocket disconnected'}
          />
        </div>
      </nav>
    </header>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-canvas text-text-primary">
        <Header />
        <StatusBanner />
        <main className="p-6">
          <Routes>
            <Route path="/" element={<Navigate to="/clusters" replace />} />
            <Route path="/clusters" element={<ClusterRedirect />} />
            <Route path="/clusters/:clusterId" element={<Cluster />} />
            <Route path="/clusters/:clusterId/nodes/:nodeId" element={<NodeDetail />} />
            <Route path="/clusters/:clusterId/archive" element={<Archive />} />
            <Route path="/clusters/:clusterId/events" element={<Events />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
