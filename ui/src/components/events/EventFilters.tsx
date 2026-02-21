import { useEventStore } from '../../stores/eventStore'
import { EventLevel } from '../../types'
import { exportEventsUrl } from '../../api/events'

const LEVELS: EventLevel[] = ['CLUSTER', 'NODE', 'AGENT']

const LEVEL_COLORS: Record<string, { active: string; inactive: string }> = {
  CLUSTER: { active: 'bg-red-600 text-white', inactive: 'bg-gray-800 text-red-400 border-red-800' },
  NODE: { active: 'bg-blue-600 text-white', inactive: 'bg-gray-800 text-blue-400 border-blue-800' },
  AGENT: { active: 'bg-green-600 text-white', inactive: 'bg-gray-800 text-green-400 border-green-800' },
}

export function EventFilters({ clusterId }: { clusterId: string }) {
  const filters = useEventStore((s) => s.filters)
  const setFilters = useEventStore((s) => s.setFilters)
  const selectedRange = useEventStore((s) => s.selectedRange)
  const fullRange = useEventStore((s) => s.fullRange)
  const loadEvents = useEventStore((s) => s.loadEvents)
  const loadHistogram = useEventStore((s) => s.loadHistogram)

  const toggleLevel = (level: EventLevel) => {
    const current = filters.levels
    const next = current.includes(level)
      ? current.filter((l) => l !== level)
      : [...current, level]
    setFilters({ levels: next })
  }

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters({ search: e.target.value })
  }

  const handleExport = (format: 'csv' | 'json') => {
    const range = selectedRange ?? fullRange
    if (!range) return
    const url = exportEventsUrl(clusterId, format, {
      from: range.from,
      to: range.to,
      levels: filters.levels.length ? filters.levels : undefined,
    })
    window.open(url, '_blank')
  }

  // Apply filters - reload events + histogram
  const applyFilters = () => {
    loadEvents(clusterId)
    loadHistogram(clusterId)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Level toggles */}
      {LEVELS.map((level) => {
        const isActive = filters.levels.length === 0 || filters.levels.includes(level)
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

      {/* Export */}
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
      </div>
    </div>
  )
}
