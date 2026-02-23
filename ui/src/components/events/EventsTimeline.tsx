import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useEventStore, RangeMode } from '../../stores/eventStore'
import { useClusterStore } from '../../stores/clusterStore'
import { TimelineOverview } from './TimelineOverview'
import { EventList } from './EventList'
import { EventFilters } from './EventFilters'
import { EventLevel } from '../../types'
import { EventSeverity } from '../../utils/eventSeverity'

function parseRangeFromUrl(params: URLSearchParams): RangeMode | null {
  const range = params.get('range')
  if (range === 'all') return { type: 'all' }
  if (range === 'custom') {
    const from = params.get('from')
    const to = params.get('to')
    if (from && to) return { type: 'absolute', from: Number(from), to: Number(to) }
  }
  // Relative: "5m", "15m", "1h", etc.
  if (range) {
    const match = range.match(/^(\d+)(m|h|d)$/)
    if (match) {
      const val = Number(match[1])
      const unit = match[2]
      const ms = val * (unit === 'm' ? 60000 : unit === 'h' ? 3600000 : 86400000)
      return { type: 'relative', ms, label: range }
    }
  }
  return null
}

function rangeModeToUrl(mode: RangeMode): Record<string, string> {
  switch (mode.type) {
    case 'relative': return { range: mode.label }
    case 'absolute': return { range: 'custom', from: String(mode.from), to: String(mode.to) }
    case 'all': return { range: 'all' }
  }
}

export function EventsTimeline({ clusterId }: { clusterId: string }) {
  const cluster = useClusterStore((s) => s.clusters.get(clusterId))
  const setClusterStart = useEventStore((s) => s.setClusterStart)
  const loadEvents = useEventStore((s) => s.loadEvents)
  const loadHistogram = useEventStore((s) => s.loadHistogram)
  const expireOldEvents = useEventStore((s) => s.expireOldEvents)
  const reset = useEventStore((s) => s.reset)
  const rangeMode = useEventStore((s) => s.rangeMode)
  const filters = useEventStore((s) => s.filters)
  const setRangeMode = useEventStore((s) => s.setRangeMode)
  const setFilters = useEventStore((s) => s.setFilters)
  const setAutoRefresh = useEventStore((s) => s.setAutoRefresh)

  const [searchParams, setSearchParams] = useSearchParams()
  const initialized = useRef(false)

  // Restore state from URL on mount
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const urlRange = parseRangeFromUrl(searchParams)
    if (urlRange) setRangeMode(urlRange)

    const levels = searchParams.get('levels')
    const severities = searchParams.get('severities')
    const search = searchParams.get('search')
    if (levels || severities || search) {
      setFilters({
        ...(levels ? { levels: levels.split(',') as EventLevel[] } : {}),
        ...(severities ? { severities: severities.split(',') as EventSeverity[] } : {}),
        ...(search ? { search } : {}),
      })
    }

    if (searchParams.get('paused') === '1') setAutoRefresh(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync store state to URL
  const autoRefresh = useEventStore((s) => s.autoRefresh)
  useEffect(() => {
    if (!initialized.current) return
    const params: Record<string, string> = rangeModeToUrl(rangeMode)
    if (filters.levels.length > 0) params.levels = filters.levels.join(',')
    if (filters.severities.length > 0) params.severities = filters.severities.join(',')
    if (filters.search) params.search = filters.search
    if (!autoRefresh) params.paused = '1'
    setSearchParams(params, { replace: true })
  }, [rangeMode, filters.levels, filters.severities, filters.search, autoRefresh, setSearchParams])

  // Set cluster start time
  useEffect(() => {
    const clusterStartMs = cluster?.clusterStats?.clusterStartMs
    if (clusterStartMs && clusterStartMs > 0) {
      setClusterStart(clusterStartMs)
    }
  }, [cluster?.clusterStats?.clusterStartMs, setClusterStart])

  // Load events and histogram when range mode or filters change
  useEffect(() => {
    loadEvents(clusterId)
    loadHistogram(clusterId)
  }, [clusterId, rangeMode, loadEvents, loadHistogram])

  // Periodically refresh for relative ranges + expire old events
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      const store = useEventStore.getState()
      if (store.isLive) {
        store.expireOldEvents()
        loadEvents(clusterId)
        loadHistogram(clusterId)
      }
    }, 10000)
    return () => clearInterval(interval)
  }, [clusterId, autoRefresh, loadEvents, loadHistogram, expireOldEvents])

  // Reset on unmount
  useEffect(() => {
    return () => reset()
  }, [clusterId, reset])

  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-4 space-y-3">
      <EventFilters clusterId={clusterId} />
      <TimelineOverview />
      <EventList clusterId={clusterId} />
    </div>
  )
}
