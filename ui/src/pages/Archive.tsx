import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useClusterStore } from '../stores/clusterStore'
import { useWebSocket } from '../hooks/useWebSocket'
import { RecordingRow, RecordingType, DiskGrowthStats } from '../types'
import RecordingViewer from '../components/RecordingViewer'
import type { ViewMode } from '../lib/decoder'
import { formatBytes } from '../utils/counters'
import { toast } from 'sonner'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DiskDonut } from '../components/DiskDonut'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import { ChevronDown, MoreHorizontal } from 'lucide-react'

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
  const [confirmAction, setConfirmAction] = useState<{ label: string; description?: string; fn: () => void } | null>(null)
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

  function withConfirm(label: string, description: string, fn: () => void) {
    setConfirmAction({ label, description, fn })
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
          {diskStats.map((d) => (
            <DiskDonut
              key={d.nodeId}
              label={d.name}
              recordings={d.recordings}
              used={d.used}
              total={d.total}
              growth={d.growth}
            />
          ))}
        </div>
      )}

      {/* Filters + Actions + Pagination */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Node filter chips (grouped like Events range selector) */}
        <div className="flex items-center gap-0.5 rounded bg-surface border border-border-subtle p-0.5">
          <button
            onClick={() => updateParams({ node: null, page: null })}
            className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
              filterNode === null ? 'bg-elevated text-text-primary' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            All
          </button>
          {nodeIds.map((id) => (
            <button
              key={id}
              onClick={() => updateParams({ node: filterNode === id ? null : String(id), page: null })}
              className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                filterNode === id ? 'bg-elevated text-text-primary' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {nodeName(id, nodes.get(id)?.agentMode)}
            </button>
          ))}
        </div>

        {/* Type dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded px-2 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1">
              Type
              {filterType ? (
                <span className="rounded-full bg-info-fill/20 text-info-text px-1.5 text-[10px]">{filterType}</span>
              ) : (
                <ChevronDown className="h-3 w-3 opacity-50" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="bg-elevated border-border-subtle">
            {recordingTypes.map((t) => (
              <DropdownMenuCheckboxItem
                key={t}
                checked={filterType === t}
                onCheckedChange={() => updateParams({ type: filterType === t ? null : t, page: null })}
                className="text-text-primary text-xs"
              >
                {t}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Sort dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded px-2 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1">
              {sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}
              <ChevronDown className="h-3 w-3 opacity-50" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="bg-elevated border-border-subtle">
            <DropdownMenuItem onClick={() => updateParams({ sort: null, page: null })} className="text-text-primary text-xs">
              Newest first
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => updateParams({ sort: 'asc', page: null })} className="text-text-primary text-xs">
              Oldest first
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="w-px h-5 bg-border-subtle" />

        {/* Actions */}
        <span className="text-xs text-text-muted">Actions</span>
        <button
          disabled={loading !== null || filterNode === null}
          onClick={() => filterNode !== null && executeAction('Verify Archive', filterNode, 'archive/verify', 'GET')}
          title={filterNode === null ? 'Select a node first' : 'Check archive integrity'}
          className="rounded border border-border-medium px-2.5 py-1 text-xs font-medium text-text-primary hover:bg-elevated transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading === 'Verify Archive' ? '...' : 'Verify'}
        </button>
        <button
          disabled={loading !== null || filterNode === null}
          onClick={() => filterNode !== null && withConfirm(
            'Compact Archive',
            `This will remove deleted and invalidated recording segments from ${nodeName(filterNode!, nodes.get(filterNode!)?.agentMode)} to reclaim disk space. Active recordings are not affected.`,
            () => executeAction('Compact Archive', filterNode, 'archive/compact'),
          )}
          title={filterNode === null ? 'Select a node first' : 'Compact archive to reclaim space'}
          className="rounded border border-critical-fill/40 px-2.5 py-1 text-xs font-medium text-critical-text hover:bg-critical-surface transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Compact
        </button>
        <button
          disabled={loading !== null || filterNode === null}
          onClick={() => filterNode !== null && withConfirm(
            'Delete Orphaned Segments',
            `This will permanently delete segment files on ${nodeName(filterNode!, nodes.get(filterNode!)?.agentMode)} that are not referenced by any recording in the catalog. This cannot be undone.`,
            () => executeAction('Delete Orphaned', filterNode, 'archive/delete-orphaned'),
          )}
          title={filterNode === null ? 'Select a node first' : 'Delete orphaned segment files'}
          className="rounded border border-critical-fill/40 px-2.5 py-1 text-xs font-medium text-critical-text hover:bg-critical-surface transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Delete Orphaned
        </button>

        {/* Right side: count + pagination */}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-text-muted">
            {fetchLoading ? '...' : `${totalElements.toLocaleString()}`}
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
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction?.label ?? ''}
        description={confirmAction?.description}
        destructive={confirmAction?.label?.includes('Invalid') || confirmAction?.label?.includes('Delete') || confirmAction?.label?.includes('Compact') || false}
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
                    <td className="px-4 py-2 font-mono text-text-primary">{rec.nodeId}</td>
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
                            <DropdownMenuItem onClick={() => withConfirm(
                              `Mark recording ${rec.recordingId} invalid`,
                              'This marks the recording as invalid in the catalog. It will be skipped during recovery and can be removed by compacting the archive.',
                              () => executeAction(`Mark Invalid #${rec.recordingId}`, rec.nodeId, `archive/recordings/${rec.recordingId}/mark-invalid`),
                            )}>
                              Invalidate
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => withConfirm(
                              `Mark recording ${rec.recordingId} valid`,
                              'This restores a previously invalidated recording so it can be used for recovery again.',
                              () => executeAction(`Mark Valid #${rec.recordingId}`, rec.nodeId, `archive/recordings/${rec.recordingId}/mark-valid`),
                            )}>
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
