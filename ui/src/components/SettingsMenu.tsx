import { useState, useEffect, useRef } from 'react'
import { triggerReconcile } from '../api/events'

export function SettingsMenu({ clusterId }: { clusterId: string }) {
  const [open, setOpen] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleReconcile = async () => {
    if (!confirm('Reconcile events from Aeron artifacts? This may take a moment.')) return
    setReconciling(true)
    setOpen(false)
    try {
      await triggerReconcile(clusterId)
    } finally {
      setReconciling(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-gray-400 hover:text-gray-200 transition-colors p-1"
        title="Settings"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg py-1 min-w-[180px] z-50">
          <button
            onClick={handleReconcile}
            disabled={reconciling}
            className="w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {reconciling ? 'Reconciling...' : 'Reconcile Events'}
          </button>
        </div>
      )}
    </div>
  )
}
