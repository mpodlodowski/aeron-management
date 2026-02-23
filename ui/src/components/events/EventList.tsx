import { useState } from 'react'
import { useEventStore } from '../../stores/eventStore'
import { ClusterEvent } from '../../types'
import { getEventSeverity, SEVERITY_BADGE } from '../../utils/eventSeverity'

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
      <div className="rounded-lg border border-border-subtle bg-surface p-5">
        <h3 className="text-sm font-medium text-text-secondary mb-3">Events</h3>
        <p className="text-sm text-text-muted">No events match the current filters</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-surface">
      <div className="px-4 py-3 border-b border-border-subtle">
        <h3 className="text-sm font-medium text-text-secondary">
          Events <span className="text-text-muted">({totalElements})</span>
        </h3>
      </div>
      <div>
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
        <div className="px-4 py-2 border-t border-border-subtle">
          <button
            onClick={() => loadMore(clusterId)}
            className="text-xs text-info-text hover:text-info-text/80"
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
        className="px-4 py-2 flex items-center gap-3 text-sm cursor-pointer hover:bg-elevated/50 transition-colors"
        onClick={onToggle}
      >
        <span className="font-mono text-text-muted text-xs shrink-0 w-20">
          {new Date(event.timestamp).toLocaleTimeString()}
        </span>
        <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium shrink-0 ${SEVERITY_BADGE[getEventSeverity(event.type)]}`}>
          {event.type.replace(/_/g, ' ')}
        </span>
        <span className="text-[10px] text-text-muted shrink-0">
          {event.level}{event.nodeId != null ? ` ${event.nodeId}` : ''}
        </span>
        <span className="text-text-primary text-xs truncate flex-1">
          {event.message}
        </span>
        {event.username && event.username !== 'system' && (
          <span className="text-[10px] text-text-muted shrink-0">{event.username}</span>
        )}
        {sourceLabel && (
          <span className="text-[10px] text-text-muted shrink-0">{sourceLabel}</span>
        )}
        <span className="text-text-muted text-xs shrink-0">{expanded ? '\u25B2' : '\u25BC'}</span>
      </div>
      {expanded && (
        <div className="px-4 py-2 bg-canvas border-t border-border-subtle/50">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs mb-2">
            <div><span className="text-text-muted">ID:</span> <span className="text-text-secondary font-mono">{event.id}</span></div>
            <div><span className="text-text-muted">Source:</span> <span className="text-text-secondary">{event.source}</span></div>
            {event.username && event.username !== 'system' && (
              <div><span className="text-text-muted">User:</span> <span className="text-text-secondary">{event.username}</span></div>
            )}
            <div><span className="text-text-muted">Created:</span> <span className="text-text-secondary font-mono">{new Date(event.createdAt).toLocaleString()}</span></div>
          </div>
          {Object.keys(event.details).length > 0 && (
            <pre className="text-xs text-text-secondary bg-surface rounded p-2 overflow-x-auto font-mono">
              {JSON.stringify(event.details, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
