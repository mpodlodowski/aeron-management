import { PaginatedEvents, EventHistogram, EventLevel } from '../types'

interface EventQueryParams {
  from?: number
  to?: number
  levels?: EventLevel[]
  types?: string[]
  nodeId?: number
  search?: string
  sort?: 'asc' | 'desc'
  page?: number
  size?: number
}

export async function fetchEvents(clusterId: string, params: EventQueryParams): Promise<PaginatedEvents> {
  const searchParams = new URLSearchParams()
  if (params.from != null) searchParams.set('from', String(params.from))
  if (params.to != null) searchParams.set('to', String(params.to))
  if (params.levels?.length) searchParams.set('levels', params.levels.join(','))
  if (params.types?.length) searchParams.set('types', params.types.join(','))
  if (params.nodeId != null) searchParams.set('nodeId', String(params.nodeId))
  if (params.search) searchParams.set('search', params.search)
  searchParams.set('sort', params.sort ?? 'desc')
  searchParams.set('page', String(params.page ?? 0))
  searchParams.set('size', String(params.size ?? 50))

  const res = await fetch(`/api/clusters/${clusterId}/events?${searchParams}`)
  return res.json()
}

export async function fetchHistogram(
  clusterId: string,
  from: number,
  to: number,
  buckets: number = 100,
  levels?: EventLevel[],
  nodeId?: number
): Promise<EventHistogram> {
  const params = new URLSearchParams({ from: String(from), to: String(to), buckets: String(buckets) })
  if (levels?.length) params.set('levels', levels.join(','))
  if (nodeId != null) params.set('nodeId', String(nodeId))

  const res = await fetch(`/api/clusters/${clusterId}/events/histogram?${params}`)
  return res.json()
}

export async function triggerReconcile(clusterId: string): Promise<void> {
  await fetch(`/api/clusters/${clusterId}/events/reconcile`, { method: 'POST' })
}

export function exportEventsUrl(clusterId: string, format: 'csv' | 'json', params: EventQueryParams): string {
  const searchParams = new URLSearchParams({ format })
  if (params.from != null) searchParams.set('from', String(params.from))
  if (params.to != null) searchParams.set('to', String(params.to))
  if (params.levels?.length) searchParams.set('levels', params.levels.join(','))
  return `/api/clusters/${clusterId}/events/export?${searchParams}`
}
