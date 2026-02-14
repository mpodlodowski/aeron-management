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

  const match = location.pathname.match(/^\/nodes\/(\d+)$/)
  if (match) {
    const id = Number(match[1])
    const metrics = nodes.get(id)
    const isBackup = metrics?.agentMode === 'backup'
    if (isBackup) {
      return <>Backup <RoleBadge role="BACKUP" /></>
    }
    const role = metrics?.clusterMetrics?.nodeRole ?? 'UNKNOWN'
    return <>Node {id} <RoleBadge role={role} /></>
  }

  return null
}

function RoleBadge({ role }: { role: string }) {
  const color = role === 'BACKUP' ? 'bg-purple-500' :
    role === 'LEADER' ? 'bg-green-500' :
    role === 'FOLLOWER' ? 'bg-blue-500' :
    role === 'CANDIDATE' ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color} text-white align-middle`}>
      {role}
    </span>
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
