import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useClusterStore } from '../stores/clusterStore'
import { useWebSocket } from '../hooks/useWebSocket'
import { RecordingRow, RecordingType, DiskGrowthStats } from '../types'
import RecordingViewer from '../components/RecordingViewer'
import type { ViewMode } from '../lib/decoder'
import { formatBytes, formatGrowthRate, formatDuration } from '../utils/counters'
import { toast } from 'sonner'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { diskBarColor, ttfColor } from '../utils/statusColors'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal } from 'lucide-react'

function nodeName(nodeId: number, agentMode?: string) {
  return agentMode === 'backup' ? 'Backup' : `Node ${nodeId}`
}

const KNOWN_BADGE_CLASS: Record<string, string> = {}
const DEFAULT_BADGE_CLASS = 'bg-elevated text-text-secondary'

function typeBadgeClass(type: string): string {
  return KNOWN_BADGE_CLASS[type] ?? DEFAULT_BADGE_CLASS
}

function formatTimestamp(ts: number): string {
  if (ts <= 0) return '\u2014'
  const d = new Date(ts)
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export default function Archive() {
  const { clusterId } = useParams<{ clusterId: string }>()
  useWebSocket(clusterId)
  const nodes = useClusterStore((s) => s.clusters.get(clusterId ?? '')?.nodes ?? new Map())

  const [searchParams, setSearchParams] = useSearchParams()
  const [actionResult, setActionResult] = useState<{ action: string; output?: string } | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ label: string; fn: () => void } | null>(null)
  const pageSize = 100

  // Derive filterable state from URL search params
  const filterNode = searchParams.has('node') ? Number(searchParams.get('node')) : null
  const filterType = (searchParams.get('type') as RecordingType | null)
  const sortOrder: 'desc' | 'asc' = searchParams.get('sort') === 'asc' ? 'asc' : 'desc'
  const rawPage = parseInt(searchParams.get('page') ?? '', 10)
  const page = isNaN(rawPage) || rawPage < 1 ? 0 : rawPage - 1
  const hexViewTarget = searchParams.has('rec') ? {
    nodeId: Number(searchParams.get('recNode') ?? '0'),
    recordingId: Number(searchParams.get('rec')),
    totalSize: Number(searchParams.get('recSize') ?? '0'),
  } : null
  const viewerOffset = Number(searchParams.get('offset') ?? '0')
  const rawMode = searchParams.get('mode')
  const viewerMode: ViewMode = rawMode === 'tree' || rawMode === 'table' ? rawMode : 'hex'

  const updateParams = useCallback((updates: Record<string, string | null>, replace = false) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) next.delete(key)
        else next.set(key, value)
      }
      return next
    }, { replace })
  }, [setSearchParams])

  const goToPage = useCallback((p: number) => {
    updateParams({ page: p > 0 ? String(p + 1) : null }, true)
  }, [updateParams])

  const handleViewerStateChange = useCallback((state: { offset: number; viewMode: ViewMode }) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (state.offset > 0) next.set('offset', String(state.offset))
      else next.delete('offset')
      if (state.viewMode !== 'hex') next.set('mode', state.viewMode)
      else next.delete('mode')
      return next
    }, { replace: true })
  }, [setSearchParams])

  const [recordings, setRecordings] = useState<RecordingRow[]>([])
  const [totalElements, setTotalElements] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [fetchLoading, setFetchLoading] = useState(false)
  const [availableTypes, setAvailableTypes] = useState<string[]>([])

  // Cluster overview is delivered via WebSocket on subscribe (see WebSocketSubscriptionHandler)

  const fetchRecordings = useCallback(() => {
    if (!clusterId) return
    const params = new URLSearchParams()
    if (filterNode !== null) params.set('nodeId', String(filterNode))
    if (filterType !== null) params.set('type', filterType)
    params.set('page', String(page))
    params.set('size', String(pageSize))
    params.set('sort', sortOrder)

    setFetchLoading(true)
    fetch(`/api/clusters/${clusterId}/recordings?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setRecordings(data.content)
        setTotalElements(data.totalElements)
        setTotalPages(data.totalPages)
        if (data.availableTypes) setAvailableTypes(data.availableTypes)
      })
      .catch(() => {})
      .finally(() => setFetchLoading(false))
  }, [clusterId, filterNode, filterType, page, pageSize, sortOrder])

  useEffect(() => {
    fetchRecordings()
  }, [fetchRecordings])

  const nodeIds = useMemo(
    () => Array.from(nodes.keys()).sort((a, b) => a - b),
    [nodes],
  )

  const recordingTypes = availableTypes.length > 0
    ? availableTypes
    : [...new Set(recordings.map((r) => r.type))].sort()

  async function executeAction(label: string, nodeId: number, endpoint: string, method: 'POST' | 'GET' = 'POST') {
    setLoading(label)
    setActionResult(null)
    try {
      const res = await fetch(`/api/clusters/${clusterId}/nodes/${nodeId}/${endpoint}`, { method })
      const data = await res.json()
      const success = data.success !== false
      const message = data.message ?? (success ? 'Action completed' : 'Action failed')
      if (success) {
        toast.success(`${label}: ${message}`)
        setActionResult(data.output ? { action: label, output: data.output } : null)
      } else {
        toast.error(`${label}: ${message}`)
        setActionResult(null)
      }
      fetchRecordings()
      // Agent needs a metrics cycle to reflect changes; refetch after delay
      setTimeout(fetchRecordings, 2000)
    } catch (err) {
      toast.error(`${label}: ${err instanceof Error ? err.message : 'Network error'}`)
      setActionResult(null)
    } finally {
      setLoading(null)
    }
  }

  function withConfirm(label: string, fn: () => void) {
    setConfirmAction({ label, fn })
  }

  const diskStats = useMemo(() => {
    const stats: { nodeId: number; name: string; recordings: number; used: number; total: number; growth?: DiskGrowthStats }[] = []
    for (const [nodeId, metrics] of nodes) {
      const sys = metrics.systemMetrics
      if (sys && sys.archiveDiskTotalBytes > 0) {
        stats.push({
          nodeId,
          name: nodeName(nodeId, metrics.agentMode),
          recordings: metrics.recordingsTotalBytes ?? 0,
          used: sys.archiveDiskUsedBytes,
          total: sys.archiveDiskTotalBytes,
          growth: metrics.diskGrowth,
        })
      }
    }
    return stats.sort((a, b) => a.nodeId - b.nodeId)
  }, [nodes])

  return (
    <div className="space-y-6">
      {/* Disk Usage Summary */}
      {diskStats.length > 0 && (
        <div className="flex flex-wrap gap-4">
          {diskStats.map((d) => {
            const recPct = (d.recordings / d.total) * 100
            const otherPct = (Math.max(0, d.used - d.recordings) / d.total) * 100
            const usedPct = Math.round((d.used / d.total) * 100)
            const rate = d.growth?.growthRate1h ?? d.growth?.growthRate5m ?? null
            const ttf = d.growth?.timeToFullSeconds ?? null
            return (
              <div key={d.nodeId} className="flex-1 min-w-[240px] rounded-lg border border-border-subtle bg-surface p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-text-secondary">{d.name}</span>
                  <div className="flex items-center gap-2">
                    {rate !== null && rate !== 0 && (
                      <span className={`text-xs ${rate > 0 ? 'text-warning-text' : 'text-success-text'}`}>
                        {formatGrowthRate(rate)}
                      </span>
                    )}
                    <span className="text-xs text-text-secondary">{usedPct}% used</span>
                  </div>
                </div>
                <div className="flex h-2 rounded-full bg-elevated overflow-hidden">
                  <div className="bg-info-fill" style={{ width: `${recPct}%` }} title={`Recordings: ${formatBytes(d.recordings)}`} />
                  <div className={diskBarColor(usedPct)} style={{ width: `${otherPct}%` }} title={`Other: ${formatBytes(d.used - d.recordings)}`} />
                </div>
                <div className="mt-1.5 flex gap-3 text-xs text-text-muted">
                  <span><span className="inline-block w-2 h-2 rounded-full bg-info-fill mr-1" />Recordings {formatBytes(d.recordings)}</span>
                  <span><span className={`inline-block w-2 h-2 rounded-full ${diskBarColor(usedPct)} mr-1`} />Other {formatBytes(Math.max(0, d.used - d.recordings))}</span>
                  <span className="ml-auto flex gap-3">
                    {ttf !== null && (
                      <span className={ttfColor(ttf)}>
                        Full in {formatDuration(ttf)}
                      </span>
                    )}
                    <span>{formatBytes(d.total - d.used)} free</span>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-text-muted w-10">Node</span>
          {nodeIds.map((id) => (
            <button
              key={id}
              onClick={() => updateParams({ node: filterNode === id ? null : String(id), page: null })}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filterNode === id
                  ? 'bg-elevated text-text-primary border border-border-medium'
                  : 'bg-surface text-text-secondary border border-border-subtle hover:text-text-primary'
              }`}
            >
              {nodeName(id, nodes.get(id)?.agentMode)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-text-muted w-10">Type</span>
          {recordingTypes.map((t) => (
            <button
              key={t}
              onClick={() => updateParams({ type: filterType === t ? null : t, page: null })}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filterType === t
                  ? 'bg-elevated text-text-primary border border-border-medium'
                  : 'bg-surface text-text-secondary border border-border-subtle hover:text-text-primary'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-text-muted w-10">Sort</span>
          {([['desc', 'Newest first'], ['asc', 'Oldest first']] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => val !== sortOrder && updateParams({ sort: val === 'desc' ? null : val, page: null })}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                sortOrder === val
                  ? 'bg-elevated text-text-primary border border-border-medium'
                  : 'bg-surface text-text-secondary border border-border-subtle hover:text-text-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Global Archive Actions */}
      <div className="flex flex-wrap gap-2">
        <button
          disabled={loading !== null || filterNode === null}
          onClick={() => filterNode !== null && executeAction('Verify Archive', filterNode, 'archive/verify', 'GET')}
          title={filterNode === null ? 'Select a node to verify its archive' : 'Check archive integrity by verifying the catalog and all recording segment files'}
          className="rounded-md border border-border-medium px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-elevated disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading === 'Verify Archive' ? 'Verifying...' : 'Verify Archive'}
        </button>
        <button
          disabled={loading !== null || filterNode === null}
          onClick={() => filterNode !== null && withConfirm('Compact Archive', () => executeAction('Compact Archive', filterNode, 'archive/compact'))}
          title={filterNode === null ? 'Select a node to compact its archive' : 'Remove deleted and invalidated recording segments to reclaim disk space'}
          className="rounded-md border border-border-medium px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-elevated disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Compact
        </button>
        <button
          disabled={loading !== null || filterNode === null}
          onClick={() => filterNode !== null && withConfirm('Delete Orphaned Segments', () => executeAction('Delete Orphaned', filterNode, 'archive/delete-orphaned'))}
          title={filterNode === null ? 'Select a node to delete orphaned segments' : 'Delete segment files on disk that are not referenced by any recording in the catalog'}
          className="rounded-md border border-border-medium px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-elevated disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Delete Orphaned
        </button>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmAction !== null}
        title={`Confirm: ${confirmAction?.label}?`}
        destructive={confirmAction?.label?.includes('Invalid') || confirmAction?.label?.includes('Delete') || false}
        onConfirm={() => { confirmAction?.fn(); setConfirmAction(null) }}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Action Output */}
      {actionResult?.output && (
        <pre className="rounded-md bg-canvas border border-border-subtle px-4 py-3 text-xs font-mono text-text-secondary overflow-x-auto whitespace-pre-wrap max-h-60">
          <div className="flex justify-between items-center mb-2">
            <span className="text-text-muted">{actionResult.action}</span>
            <button onClick={() => setActionResult(null)} className="text-text-muted hover:text-text-primary text-xs">dismiss</button>
          </div>
          {actionResult.output}
        </pre>
      )}

      {/* Summary + Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary">
          {fetchLoading ? 'Loading...' : `${totalElements.toLocaleString()} recordings`}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              disabled={page === 0}
              onClick={() => goToPage(0)}
              className="rounded-md bg-surface px-2 py-1 text-xs text-text-primary hover:bg-elevated disabled:opacity-30"
            >
              First
            </button>
            <button
              disabled={page === 0}
              onClick={() => goToPage(page - 1)}
              className="rounded-md bg-surface px-2 py-1 text-xs text-text-primary hover:bg-elevated disabled:opacity-30"
            >
              Prev
            </button>
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault()
                const input = (e.currentTarget.elements.namedItem('pageInput') as HTMLInputElement)
                const v = parseInt(input.value, 10)
                if (!isNaN(v) && v >= 1 && v <= totalPages) goToPage(v - 1)
                input.value = String(page + 1)
              }}
            >
              <input
                name="pageInput"
                key={page}
                defaultValue={page + 1}
                className="w-12 rounded bg-elevated border border-border-medium px-1.5 py-1 text-xs text-text-primary text-center"
                onBlur={(e) => {
                  const v = parseInt(e.target.value, 10)
                  if (!isNaN(v) && v >= 1 && v <= totalPages) goToPage(v - 1)
                  else e.target.value = String(page + 1)
                }}
              />
              <span className="text-xs text-text-muted">/ {totalPages}</span>
            </form>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => goToPage(page + 1)}
              className="rounded-md bg-surface px-2 py-1 text-xs text-text-primary hover:bg-elevated disabled:opacity-30"
            >
              Next
            </button>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => goToPage(totalPages - 1)}
              className="rounded-md bg-surface px-2 py-1 text-xs text-text-primary hover:bg-elevated disabled:opacity-30"
            >
              Last
            </button>
          </div>
        )}
      </div>

      {/* Recordings Table */}
      <div className="rounded-lg border border-border-subtle bg-surface overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface border-b border-border-subtle">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Node
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Recording ID
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Stream
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Channel
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Start Pos
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Stop Pos
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Size
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Started
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Stopped
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {recordings.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-text-muted">
                  {fetchLoading ? 'Loading recordings...' : 'No recordings available'}
                </td>
              </tr>
            ) : (
              recordings.map((rec) => {
                const isActive = rec.stopPosition === -1 || rec.stopTimestamp === 0
                const size = rec.stopPosition > rec.startPosition ? rec.stopPosition - rec.startPosition : 0
                const isInvalid = rec.state === 'INVALID'
                const isDeleted = rec.state === 'DELETED'
                const rowClass = isInvalid || isDeleted ? 'hover:bg-elevated/50 opacity-60' : 'hover:bg-elevated/50'
                return (
                  <tr key={`${rec.nodeId}-${rec.recordingId}`} className={rowClass}>
                    <td className="px-4 py-2 text-text-primary">{nodeName(rec.nodeId, nodes.get(rec.nodeId)?.agentMode)}</td>
                    <td className="px-4 py-2 font-mono text-text-primary">
                      {rec.recordingId}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${typeBadgeClass(rec.type)}`}>
                        {rec.type}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-text-secondary">
                      {rec.streamId}
                    </td>
                    <td className="px-4 py-2 text-text-secondary max-w-xs truncate">
                      {rec.channel}
                    </td>
                    <td className="px-4 py-2 font-mono text-text-secondary">
                      {rec.startPosition.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 font-mono text-text-secondary">
                      {isActive ? '\u2014' : rec.stopPosition.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 font-mono text-text-secondary">
                      {size > 0 ? formatBytes(size) : '\u2014'}
                    </td>
                    <td className="px-4 py-2 text-text-secondary whitespace-nowrap">
                      {formatTimestamp(rec.startTimestamp)}
                    </td>
                    <td className="px-4 py-2 text-text-secondary whitespace-nowrap">
                      {formatTimestamp(rec.stopTimestamp)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        {isInvalid ? (
                          <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-critical-surface text-critical-text">
                            INVALID
                          </span>
                        ) : isDeleted ? (
                          <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-critical-surface text-critical-text">
                            DELETED
                          </span>
                        ) : isActive ? (
                          <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-success-surface text-success-text">
                            ACTIVE
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-elevated text-text-secondary">
                            STOPPED
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          disabled={loading !== null}
                          onClick={() => {
                            updateParams({
                              rec: String(rec.recordingId),
                              recNode: String(rec.nodeId),
                              recSize: String(size > 0 ? size : 0),
                              offset: null,
                              mode: null,
                            })
                          }}
                          title="View raw bytes"
                          className="text-info-text hover:underline text-xs disabled:opacity-50"
                        >
                          Bytes
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="rounded p-1 hover:bg-elevated text-text-muted hover:text-text-primary">
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-elevated border-border-subtle">
                            <DropdownMenuItem onClick={() => executeAction(`Describe #${rec.recordingId}`, rec.nodeId, `archive/recordings/${rec.recordingId}/describe`, 'GET')}>
                              Describe
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => executeAction(`Verify #${rec.recordingId}`, rec.nodeId, `archive/recordings/${rec.recordingId}/verify`, 'GET')}>
                              Verify
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => withConfirm(`Mark recording ${rec.recordingId} invalid`, () => executeAction(`Mark Invalid #${rec.recordingId}`, rec.nodeId, `archive/recordings/${rec.recordingId}/mark-invalid`))}>
                              Invalidate
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => withConfirm(`Mark recording ${rec.recordingId} valid`, () => executeAction(`Mark Valid #${rec.recordingId}`, rec.nodeId, `archive/recordings/${rec.recordingId}/mark-valid`))}>
                              Validate
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      {hexViewTarget && (
        <RecordingViewer
          key={`${hexViewTarget.nodeId}-${hexViewTarget.recordingId}`}
          clusterId={clusterId!}
          nodeId={hexViewTarget.nodeId}
          recordingId={hexViewTarget.recordingId}
          totalSize={hexViewTarget.totalSize}
          initialOffset={viewerOffset}
          initialViewMode={viewerMode}
          onClose={() => updateParams({ rec: null, recNode: null, recSize: null, offset: null, mode: null })}
          onStateChange={handleViewerStateChange}
        />
      )}
    </div>
  )
}
