import { useState } from 'react'
import { useEventStore } from '../../stores/eventStore'
import { EventLevel } from '../../types'
import { EventSeverity } from '../../utils/eventSeverity'
import { exportEventsUrl, triggerReconcile } from '../../api/events'

const LEVELS: EventLevel[] = ['CLUSTER', 'NODE', 'AGENT']

const LEVEL_COLORS: Record<string, { active: string; inactive: string }> = {
  CLUSTER: { active: 'bg-purple-600 text-white', inactive: 'bg-gray-800 text-purple-400 border-purple-800' },
  NODE: { active: 'bg-blue-600 text-white', inactive: 'bg-gray-800 text-blue-400 border-blue-800' },
  AGENT: { active: 'bg-slate-500 text-white', inactive: 'bg-gray-800 text-slate-400 border-slate-700' },
}

const SEVERITIES: EventSeverity[] = ['error', 'warning', 'info', 'success']

const SEVERITY_COLORS: Record<EventSeverity, { active: string; inactive: string }> = {
  error: { active: 'bg-red-600 text-white', inactive: 'bg-gray-800 text-red-400 border-red-800' },
  warning: { active: 'bg-yellow-600 text-white', inactive: 'bg-gray-800 text-yellow-400 border-yellow-800' },
  info: { active: 'bg-blue-600 text-white', inactive: 'bg-gray-800 text-blue-400 border-blue-800' },
  success: { active: 'bg-green-600 text-white', inactive: 'bg-gray-800 text-green-400 border-green-800' },
}

const RELATIVE_RANGES: { label: string; ms: number }[] = [
  { label: '5m', ms: 5 * 60 * 1000 },
  { label: '15m', ms: 15 * 60 * 1000 },
  { label: '1h', ms: 60 * 60 * 1000 },
  { label: '6h', ms: 6 * 60 * 60 * 1000 },
  { label: '24h', ms: 24 * 60 * 60 * 1000 },
]

function toLocalDatetime(ms: number): string {
  const d = new Date(ms)
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0') + 'T' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0')
}

export function EventFilters({ clusterId }: { clusterId: string }) {
  const filters = useEventStore((s) => s.filters)
  const setFilters = useEventStore((s) => s.setFilters)
  const rangeMode = useEventStore((s) => s.rangeMode)
  const setRangeMode = useEventStore((s) => s.setRangeMode)
  const getEffectiveRange = useEventStore((s) => s.getEffectiveRange)
  const autoRefresh = useEventStore((s) => s.autoRefresh)
  const setAutoRefresh = useEventStore((s) => s.setAutoRefresh)
  const loadEvents = useEventStore((s) => s.loadEvents)
  const loadHistogram = useEventStore((s) => s.loadHistogram)

  const [showAbsolute, setShowAbsolute] = useState(false)
  const [absFrom, setAbsFrom] = useState('')
  const [absTo, setAbsTo] = useState('')
  const [reconciling, setReconciling] = useState(false)

  const toggleLevel = (level: EventLevel) => {
    const current = filters.levels
    const next = current.includes(level)
      ? current.filter((l) => l !== level)
      : [...current, level]
    setFilters({ levels: next })
  }

  const toggleSeverity = (sev: EventSeverity) => {
    const current = filters.severities
    const next = current.includes(sev)
      ? current.filter((s) => s !== sev)
      : [...current, sev]
    setFilters({ severities: next })
  }

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters({ search: e.target.value })
  }

  const handleExport = (format: 'csv' | 'json') => {
    const range = getEffectiveRange()
    if (!range) return
    const url = exportEventsUrl(clusterId, format, {
      from: range.from,
      to: range.to,
      levels: filters.levels.length ? filters.levels : undefined,
    })
    window.open(url, '_blank')
  }

  const applyFilters = () => {
    loadEvents(clusterId)
    loadHistogram(clusterId)
  }

  const handleReconcile = async () => {
    setReconciling(true)
    try {
      await triggerReconcile(clusterId)
      setTimeout(() => applyFilters(), 2000)
    } finally {
      setReconciling(false)
    }
  }

  const selectRelative = (r: { label: string; ms: number }) => {
    setRangeMode({ type: 'relative', ms: r.ms, label: r.label })
    setShowAbsolute(false)
  }

  const selectAll = () => {
    setRangeMode({ type: 'all' })
    setShowAbsolute(false)
  }

  const openAbsolute = () => {
    const range = getEffectiveRange()
    if (range) {
      setAbsFrom(toLocalDatetime(range.from))
      setAbsTo(toLocalDatetime(range.to))
    }
    setShowAbsolute(true)
  }

  const applyAbsolute = () => {
    const from = new Date(absFrom).getTime()
    const to = new Date(absTo).getTime()
    if (!isNaN(from) && !isNaN(to) && from < to) {
      setRangeMode({ type: 'absolute', from, to })
      setShowAbsolute(false)
    }
  }

  const isRelative = (ms: number) =>
    rangeMode.type === 'relative' && rangeMode.ms === ms

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Auto-refresh toggle */}
        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={`rounded px-2 py-1 text-xs transition-colors ${
            autoRefresh ? 'bg-green-800 text-green-300 hover:bg-green-700' : 'bg-gray-800 text-gray-500 hover:text-gray-300'
          }`}
          title={autoRefresh ? 'Auto-refresh on' : 'Auto-refresh off'}
        >
          {autoRefresh ? 'Live' : 'Paused'}
        </button>

        <div className="w-px h-5 bg-gray-700" />

        {/* Range selector */}
        <div className="flex items-center gap-0.5 rounded bg-gray-800 p-0.5">
          {RELATIVE_RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => selectRelative(r)}
              className={`rounded px-2 py-0.5 text-xs transition-colors ${
                isRelative(r.ms) ? 'bg-gray-600 text-gray-100' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {r.label}
            </button>
          ))}
          <button
            onClick={selectAll}
            className={`rounded px-2 py-0.5 text-xs transition-colors ${
              rangeMode.type === 'all' ? 'bg-gray-600 text-gray-100' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            All
          </button>
          <button
            onClick={openAbsolute}
            className={`rounded px-2 py-0.5 text-xs transition-colors ${
              rangeMode.type === 'absolute' ? 'bg-gray-600 text-gray-100' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Custom
          </button>
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-gray-700" />

        {/* Level toggles */}
        {LEVELS.map((level) => {
          const isActive = filters.levels.includes(level)
          const colors = LEVEL_COLORS[level]
          return (
            <button
              key={level}
              onClick={() => { toggleLevel(level); setTimeout(() => applyFilters(), 0) }}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors ${
                isActive ? colors.active + ' border-transparent' : colors.inactive
              }`}
            >
              {level}
            </button>
          )
        })}

        <div className="w-px h-5 bg-gray-700" />

        {/* Severity toggles */}
        {SEVERITIES.map((sev) => {
          const isActive = filters.severities.includes(sev)
          const colors = SEVERITY_COLORS[sev]
          return (
            <button
              key={sev}
              onClick={() => { toggleSeverity(sev); setTimeout(() => applyFilters(), 0) }}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors ${
                isActive ? colors.active + ' border-transparent' : colors.inactive
              }`}
            >
              {sev}
            </button>
          )
        })}

        {/* Search */}
        <input
          type="text"
          placeholder="Search events..."
          value={filters.search}
          onChange={handleSearch}
          onKeyDown={(e) => { if (e.key === 'Enter') applyFilters() }}
          className="rounded bg-gray-800 border border-gray-700 px-2.5 py-1 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-gray-500 w-40"
        />

        <button
          onClick={applyFilters}
          className="rounded bg-gray-700 px-2.5 py-1 text-xs text-gray-300 hover:bg-gray-600 transition-colors"
        >
          Apply
        </button>

        {/* Export & Reconcile */}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => handleExport('csv')}
            className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            CSV
          </button>
          <button
            onClick={() => handleExport('json')}
            className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            JSON
          </button>
          <div className="w-px h-4 bg-gray-700" />
          <button
            onClick={handleReconcile}
            disabled={reconciling}
            className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-50"
            title="Reconcile events from Aeron recording log"
          >
            {reconciling ? 'Reconciling...' : 'Reconcile'}
          </button>
        </div>
      </div>

      {/* Absolute range picker */}
      {showAbsolute && (
        <div className="flex items-center gap-2">
          <input
            type="datetime-local"
            value={absFrom}
            onChange={(e) => setAbsFrom(e.target.value)}
            className="rounded bg-gray-800 border border-gray-700 px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-gray-500"
          />
          <span className="text-xs text-gray-500">to</span>
          <input
            type="datetime-local"
            value={absTo}
            onChange={(e) => setAbsTo(e.target.value)}
            className="rounded bg-gray-800 border border-gray-700 px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-gray-500"
          />
          <button
            onClick={applyAbsolute}
            className="rounded bg-blue-600 px-2.5 py-1 text-xs text-white hover:bg-blue-500 transition-colors"
          >
            Apply
          </button>
          <button
            onClick={() => setShowAbsolute(false)}
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
