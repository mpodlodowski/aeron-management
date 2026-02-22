import { create } from 'zustand'
import { ClusterEvent, EventLevel, EventHistogram } from '../types'
import { fetchEvents, fetchHistogram } from '../api/events'
import { EventSeverity, getEventSeverity } from '../utils/eventSeverity'

interface TimeRange {
  from: number
  to: number
}

interface EventFilters {
  levels: EventLevel[]
  severities: EventSeverity[]
  types: string[]
  nodeId: number | null
  search: string
}

export type RangeMode =
  | { type: 'relative'; ms: number; label: string }
  | { type: 'absolute'; from: number; to: number }
  | { type: 'all' }

interface EventStore {
  // Data
  events: ClusterEvent[]
  histogram: EventHistogram | null
  totalElements: number
  page: number

  // Time range
  clusterStartMs: number | null
  rangeMode: RangeMode
  isLive: boolean

  // Filters
  filters: EventFilters
  autoRefresh: boolean

  // Actions
  setClusterStart: (ms: number) => void
  setRangeMode: (mode: RangeMode) => void
  setFilters: (filters: Partial<EventFilters>) => void
  setAutoRefresh: (on: boolean) => void
  getEffectiveRange: () => TimeRange | null
  loadEvents: (clusterId: string) => Promise<void>
  loadHistogram: (clusterId: string) => Promise<void>
  loadMore: (clusterId: string) => Promise<void>
  addRealtimeEvent: (event: ClusterEvent) => void
  expireOldEvents: () => void
  reset: () => void
}

const defaultFilters: EventFilters = {
  levels: [],
  severities: [],
  types: [],
  nodeId: null,
  search: '',
}

const DEFAULT_RANGE: RangeMode = { type: 'relative', ms: 60 * 60 * 1000, label: '1h' }

export const useEventStore = create<EventStore>((set, get) => ({
  events: [],
  histogram: null,
  totalElements: 0,
  page: 0,
  clusterStartMs: null,
  rangeMode: DEFAULT_RANGE,
  isLive: true,
  filters: { ...defaultFilters },
  autoRefresh: true,

  setClusterStart: (ms) => set({ clusterStartMs: ms }),

  setRangeMode: (mode) => set({
    rangeMode: mode,
    isLive: mode.type === 'relative' || mode.type === 'all',
    page: 0,
  }),

  setFilters: (partial) => set((s) => ({
    filters: { ...s.filters, ...partial },
    page: 0,
  })),

  setAutoRefresh: (on) => set({ autoRefresh: on }),

  getEffectiveRange: () => {
    const { rangeMode, clusterStartMs } = get()
    const now = Date.now()
    switch (rangeMode.type) {
      case 'relative':
        return { from: now - rangeMode.ms, to: now }
      case 'absolute':
        return { from: rangeMode.from, to: rangeMode.to }
      case 'all':
        return { from: clusterStartMs ?? 0, to: now }
    }
  },

  loadEvents: async (clusterId) => {
    const range = get().getEffectiveRange()
    if (!range) return
    const { filters } = get()

    const result = await fetchEvents(clusterId, {
      from: range.from,
      to: range.to,
      levels: filters.levels.length ? filters.levels : undefined,
      types: filters.types.length ? filters.types : undefined,
      nodeId: filters.nodeId ?? undefined,
      search: filters.search || undefined,
      page: 0,
      size: 50,
    })
    const events = filters.severities.length > 0
      ? result.content.filter((e) => filters.severities.includes(getEventSeverity(e.type)))
      : result.content
    set({ events, totalElements: result.totalElements, page: 0 })
  },

  loadMore: async (clusterId) => {
    const range = get().getEffectiveRange()
    if (!range) return
    const { filters, page, events } = get()

    const nextPage = page + 1
    const result = await fetchEvents(clusterId, {
      from: range.from,
      to: range.to,
      levels: filters.levels.length ? filters.levels : undefined,
      types: filters.types.length ? filters.types : undefined,
      nodeId: filters.nodeId ?? undefined,
      search: filters.search || undefined,
      page: nextPage,
      size: 50,
    })
    const newEvents = filters.severities.length > 0
      ? result.content.filter((e) => filters.severities.includes(getEventSeverity(e.type)))
      : result.content
    set({ events: [...events, ...newEvents], page: nextPage })
  },

  loadHistogram: async (clusterId) => {
    const range = get().getEffectiveRange()
    if (!range) return
    const { filters } = get()
    const histogram = await fetchHistogram(
      clusterId, range.from, range.to, 100,
      filters.levels.length ? filters.levels : undefined,
      filters.nodeId ?? undefined,
    )
    if (filters.severities.length > 0) {
      const sevs = filters.severities
      histogram.buckets = histogram.buckets.map((b) => ({
        ...b,
        error: sevs.includes('error') ? b.error : 0,
        warning: sevs.includes('warning') ? b.warning : 0,
        info: sevs.includes('info') ? b.info : 0,
        success: sevs.includes('success') ? b.success : 0,
      }))
    }
    set({ histogram })
  },

  addRealtimeEvent: (event) => set((s) => {
    if (!s.isLive || !s.autoRefresh) return s
    const { filters } = s
    if (filters.levels.length > 0 && !filters.levels.includes(event.level)) return s
    if (filters.severities.length > 0 && !filters.severities.includes(getEventSeverity(event.type))) return s
    if (filters.nodeId != null && event.nodeId !== filters.nodeId) return s
    if (filters.search && event.message && !event.message.toLowerCase().includes(filters.search.toLowerCase())) return s
    return {
      events: [event, ...s.events].slice(0, 200),
      totalElements: s.totalElements + 1,
    }
  }),

  expireOldEvents: () => set((s) => {
    if (s.rangeMode.type !== 'relative') return s
    const cutoff = Date.now() - s.rangeMode.ms
    const filtered = s.events.filter((e) => e.timestamp >= cutoff)
    if (filtered.length === s.events.length) return s
    return { events: filtered, totalElements: s.totalElements - (s.events.length - filtered.length) }
  }),

  reset: () => set({
    events: [],
    histogram: null,
    totalElements: 0,
    page: 0,
    clusterStartMs: null,
    rangeMode: DEFAULT_RANGE,
    isLive: true,
    autoRefresh: true,
    filters: { ...defaultFilters },
  }),
}))
