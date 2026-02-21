import { create } from 'zustand'
import { ClusterEvent, EventLevel, EventHistogram } from '../types'
import { fetchEvents, fetchHistogram } from '../api/events'

interface TimeRange {
  from: number
  to: number
}

interface EventFilters {
  levels: EventLevel[]
  types: string[]
  nodeId: number | null
  search: string
}

interface EventStore {
  // Data
  events: ClusterEvent[]
  histogram: EventHistogram | null
  totalElements: number
  page: number

  // Time range
  fullRange: TimeRange | null        // cluster start -> now
  selectedRange: TimeRange | null    // user brush selection (null = full/live)
  isLive: boolean

  // Filters
  filters: EventFilters

  // Actions
  setFullRange: (range: TimeRange) => void
  setSelectedRange: (range: TimeRange | null) => void
  setFilters: (filters: Partial<EventFilters>) => void
  loadEvents: (clusterId: string) => Promise<void>
  loadHistogram: (clusterId: string) => Promise<void>
  loadMore: (clusterId: string) => Promise<void>
  addRealtimeEvent: (event: ClusterEvent) => void
  reset: () => void
}

const defaultFilters: EventFilters = {
  levels: [],
  types: [],
  nodeId: null,
  search: '',
}

export const useEventStore = create<EventStore>((set, get) => ({
  events: [],
  histogram: null,
  totalElements: 0,
  page: 0,
  fullRange: null,
  selectedRange: null,
  isLive: true,
  filters: { ...defaultFilters },

  setFullRange: (range) => set({ fullRange: range }),

  setSelectedRange: (range) => set({
    selectedRange: range,
    isLive: range === null,
    page: 0,
  }),

  setFilters: (partial) => set((s) => ({
    filters: { ...s.filters, ...partial },
    page: 0,
  })),

  loadEvents: async (clusterId) => {
    const { selectedRange, fullRange, filters } = get()
    const range = selectedRange ?? fullRange
    if (!range) return

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
    set({ events: result.content, totalElements: result.totalElements, page: 0 })
  },

  loadMore: async (clusterId) => {
    const { selectedRange, fullRange, filters, page, events } = get()
    const range = selectedRange ?? fullRange
    if (!range) return

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
    set({ events: [...events, ...result.content], page: nextPage })
  },

  loadHistogram: async (clusterId) => {
    const { fullRange } = get()
    if (!fullRange) return
    const histogram = await fetchHistogram(clusterId, fullRange.from, fullRange.to)
    set({ histogram })
  },

  addRealtimeEvent: (event) => set((s) => {
    if (!s.isLive) return s  // don't add when viewing past range
    return {
      events: [event, ...s.events].slice(0, 200),
      totalElements: s.totalElements + 1,
    }
  }),

  reset: () => set({
    events: [],
    histogram: null,
    totalElements: 0,
    page: 0,
    fullRange: null,
    selectedRange: null,
    isLive: true,
    filters: { ...defaultFilters },
  }),
}))
