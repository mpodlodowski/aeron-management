import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import NodeDetail from './pages/NodeDetail'
import Archive from './pages/Archive'

function Header() {
  const location = useLocation()
  const isHome = location.pathname === '/'

  return (
    <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-4">
      <div className="w-8">
        {!isHome && (
          <Link to="/" className="text-gray-400 hover:text-gray-200 transition-colors">
            &larr;
          </Link>
        )}
      </div>
      <Link to="/" className="text-xl font-semibold hover:text-gray-200 transition-colors">
        Aeron Management Center
      </Link>
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
