import { useState } from 'react'
import { useEventStore } from '../../stores/eventStore'
import { ClusterEvent } from '../../types'

const LEVEL_COLORS: Record<string, string> = {
  CLUSTER: 'bg-red-600',
  NODE: 'bg-blue-600',
  AGENT: 'bg-green-600',
}

const SOURCE_LABELS: Record<string, string> = {
  REALTIME: '',
  RECONCILIATION: 'reconciled',
  CATCH_UP: 'catch-up',
}

export function EventList({ clusterId }: { clusterId: string }) {
  const events = useEventStore((s) => s.events)
  const totalElements = useEventStore((s) => s.totalElements)
  const loadMore = useEventStore((s) => s.loadMore)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Events</h3>
        <p className="text-sm text-gray-600">No events match the current filters</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900">
      <div className="px-4 py-3 border-b border-gray-800">
        <h3 className="text-sm font-medium text-gray-400">
          Events <span className="text-gray-600">({totalElements})</span>
        </h3>
      </div>
      <div className="divide-y divide-gray-800/50">
        {events.map((event) => (
          <EventRow
            key={event.id}
            event={event}
            expanded={expandedId === event.id}
            onToggle={() => setExpandedId(expandedId === event.id ? null : event.id)}
          />
        ))}
      </div>
      {events.length < totalElements && (
        <div className="px-4 py-2 border-t border-gray-800">
          <button
            onClick={() => loadMore(clusterId)}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Load more...
          </button>
        </div>
      )}
    </div>
  )
}

function EventRow({ event, expanded, onToggle }: { event: ClusterEvent; expanded: boolean; onToggle: () => void }) {
  const sourceLabel = SOURCE_LABELS[event.source] ?? ''

  return (
    <div>
      <div
        className="px-4 py-2 flex items-center gap-3 text-sm cursor-pointer hover:bg-gray-800/50 transition-colors"
        onClick={onToggle}
      >
        <span className="font-mono text-gray-600 text-xs shrink-0 w-20">
          {new Date(event.timestamp).toLocaleTimeString()}
        </span>
        <span className="text-gray-500 text-xs w-8 text-center shrink-0">
          {event.nodeId != null ? event.nodeId : '-'}
        </span>
        <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white shrink-0 ${LEVEL_COLORS[event.level] ?? 'bg-gray-600'}`}>
          {event.level}
        </span>
        <span className="text-xs text-gray-500 font-mono shrink-0 w-32 truncate">
          {event.type}
        </span>
        <span className="text-gray-300 text-xs truncate flex-1">
          {event.message}
        </span>
        {sourceLabel && (
          <span className="text-[10px] text-gray-600 shrink-0">{sourceLabel}</span>
        )}
        <span className="text-gray-600 text-xs shrink-0">{expanded ? '\u25B2' : '\u25BC'}</span>
      </div>
      {expanded && (
        <div className="px-4 py-2 bg-gray-950 border-t border-gray-800/50">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs mb-2">
            <div><span className="text-gray-600">ID:</span> <span className="text-gray-400 font-mono">{event.id}</span></div>
            <div><span className="text-gray-600">Source:</span> <span className="text-gray-400">{event.source}</span></div>
            <div><span className="text-gray-600">User:</span> <span className="text-gray-400">{event.username}</span></div>
            <div><span className="text-gray-600">Created:</span> <span className="text-gray-400 font-mono">{new Date(event.createdAt).toLocaleString()}</span></div>
          </div>
          {Object.keys(event.details).length > 0 && (
            <pre className="text-xs text-gray-400 bg-gray-900 rounded p-2 overflow-x-auto font-mono">
              {JSON.stringify(event.details, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
