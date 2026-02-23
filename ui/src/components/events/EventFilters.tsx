import { useState } from 'react'
import { useEventStore } from '../../stores/eventStore'
import { EventLevel } from '../../types'
import { EventSeverity } from '../../utils/eventSeverity'
import { exportEventsUrl, triggerReconcile } from '../../api/events'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'

const LEVELS: EventLevel[] = ['CLUSTER', 'NODE', 'AGENT']

const SEVERITIES: EventSeverity[] = ['error', 'warning', 'info', 'success']

const SEVERITY_DOT: Record<EventSeverity, string> = {
  error: 'bg-critical-text',
  warning: 'bg-warning-text',
  info: 'bg-info-text',
  success: 'bg-success-text',
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
          className={`rounded px-2 py-1 text-xs transition-colors inline-flex items-center gap-1.5 ${
            autoRefresh ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'
          }`}
          title={autoRefresh ? 'Auto-refresh on' : 'Auto-refresh off'}
        >
          {autoRefresh && <span className="inline-block h-1.5 w-1.5 rounded-full bg-success-text" />}
          {autoRefresh ? 'Live' : 'Paused'}
        </button>

        <div className="w-px h-5 bg-border-subtle" />

        {/* Range selector */}
        <div className="flex items-center gap-0.5 rounded bg-surface p-0.5">
          {RELATIVE_RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => selectRelative(r)}
              className={`rounded px-2 py-0.5 text-xs transition-colors ${
                isRelative(r.ms) ? 'bg-elevated text-text-primary' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {r.label}
            </button>
          ))}
          <button
            onClick={selectAll}
            className={`rounded px-2 py-0.5 text-xs transition-colors ${
              rangeMode.type === 'all' ? 'bg-elevated text-text-primary' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            All
          </button>
          <button
            onClick={openAbsolute}
            className={`rounded px-2 py-0.5 text-xs transition-colors ${
              rangeMode.type === 'absolute' ? 'bg-elevated text-text-primary' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Custom
          </button>
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-border-subtle" />

        {/* Source filter dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5">
              Source
              {filters.levels.length > 0 && filters.levels.length < LEVELS.length && (
                <span className="rounded-full bg-info-fill/20 text-info-text px-1.5 text-[10px]">{filters.levels.length}</span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="bg-elevated border-border-subtle">
            {LEVELS.map((level) => (
              <DropdownMenuCheckboxItem
                key={level}
                checked={filters.levels.includes(level)}
                onCheckedChange={() => { toggleLevel(level); setTimeout(() => applyFilters(), 0) }}
                className="text-text-primary text-xs"
              >
                {level}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="w-px h-5 bg-border-subtle" />

        {/* Severity toggles */}
        {SEVERITIES.map((sev) => {
          const isActive = filters.severities.includes(sev)
          return (
            <button
              key={sev}
              onClick={() => { toggleSeverity(sev); setTimeout(() => applyFilters(), 0) }}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors inline-flex items-center gap-1.5 ${
                isActive
                  ? 'bg-elevated text-text-primary border-border-medium'
                  : 'border-border-subtle text-text-secondary hover:text-text-primary'
              }`}
            >
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[sev]}`} />
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
          className="rounded bg-surface border border-border-subtle px-2.5 py-1 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-border-medium w-40"
        />

        <button
          onClick={applyFilters}
          className="rounded bg-elevated px-2.5 py-1 text-xs text-text-primary hover:bg-border-subtle transition-colors"
        >
          Apply
        </button>

        {/* Export & Reconcile */}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => handleExport('csv')}
            className="rounded px-2 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            CSV
          </button>
          <button
            onClick={() => handleExport('json')}
            className="rounded px-2 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            JSON
          </button>
          <div className="w-px h-4 bg-border-subtle" />
          <button
            onClick={handleReconcile}
            disabled={reconciling}
            className="rounded px-2 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
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
            className="rounded bg-surface border border-border-subtle px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-border-medium"
          />
          <span className="text-xs text-text-muted">to</span>
          <input
            type="datetime-local"
            value={absTo}
            onChange={(e) => setAbsTo(e.target.value)}
            className="rounded bg-surface border border-border-subtle px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-border-medium"
          />
          <button
            onClick={applyAbsolute}
            className="rounded bg-info-fill px-2.5 py-1 text-xs text-white hover:bg-info-fill/80 transition-colors"
          >
            Apply
          </button>
          <button
            onClick={() => setShowAbsolute(false)}
            className="text-xs text-text-muted hover:text-text-primary"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
