import { useEffect, useState, useMemo, useCallback } from 'react'
import { useClusterStore } from '../stores/clusterStore'
import { useWebSocket } from '../hooks/useWebSocket'
import { ClusterOverview, RecordingRow, RecordingType, DiskGrowthStats } from '../types'
import { formatBytes, formatGrowthRate, formatDuration } from '../utils/counters'

interface ActionResult {
  action: string
  success: boolean
  message: string
  output?: string
}

function nodeName(nodeId: number, agentMode?: string) {
  return agentMode === 'backup' ? 'Backup' : `Node ${nodeId}`
}

const KNOWN_BADGE_CLASS: Record<string, string> = {
  LOG: 'bg-blue-900/50 text-blue-300',
  SNAPSHOT: 'bg-purple-900/50 text-purple-300',
}
const DEFAULT_BADGE_CLASS = 'bg-gray-700 text-gray-300'

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
  useWebSocket()
  const nodes = useClusterStore((s) => s.nodes)
  const updateCluster = useClusterStore((s) => s.updateCluster)
  const [filterNode, setFilterNode] = useState<number | null>(null)
  const [filterType, setFilterType] = useState<RecordingType | null>(null)
  const [actionResult, setActionResult] = useState<ActionResult | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ label: string; fn: () => void } | null>(null)
  const [page, setPage] = useState(0)
  const pageSize = 100

  const [recordings, setRecordings] = useState<RecordingRow[]>([])
  const [totalElements, setTotalElements] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [fetchLoading, setFetchLoading] = useState(false)

  useEffect(() => {
    fetch('/api/cluster')
      .then((res) => res.json())
      .then((data: ClusterOverview) => updateCluster(data))
      .catch(() => {})
  }, [updateCluster])

  const fetchRecordings = useCallback(() => {
    const params = new URLSearchParams()
    if (filterNode !== null) params.set('nodeId', String(filterNode))
    if (filterType !== null) params.set('type', filterType)
    params.set('page', String(page))
    params.set('size', String(pageSize))

    setFetchLoading(true)
    fetch(`/api/cluster/recordings?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setRecordings(data.content)
        setTotalElements(data.totalElements)
        setTotalPages(data.totalPages)
      })
      .catch(() => {})
      .finally(() => setFetchLoading(false))
  }, [filterNode, filterType, page, pageSize])

  useEffect(() => {
    fetchRecordings()
  }, [fetchRecordings])

  // Reset page when filters change
  useEffect(() => {
    setPage(0)
  }, [filterNode, filterType])

  const nodeIds = useMemo(
    () => Array.from(nodes.keys()).sort((a, b) => a - b),
    [nodes],
  )

  const recordingTypes = useMemo(
    () => [...new Set(recordings.map((r) => r.type))].sort(),
    [recordings],
  )

  async function executeAction(label: string, nodeId: number, endpoint: string, method: 'POST' | 'GET' = 'POST') {
    setLoading(label)
    setActionResult(null)
    try {
      const res = await fetch(`/api/nodes/${nodeId}/${endpoint}`, { method })
      const data = await res.json()
      setActionResult({
        action: label,
        success: data.success !== false,
        message: data.message ?? (data.success !== false ? 'Action completed' : 'Action failed'),
        output: data.output,
      })
      fetchRecordings()
      // Agent needs a metrics cycle to reflect changes; refetch after delay
      setTimeout(fetchRecordings, 2000)
    } catch (err) {
      setActionResult({
        action: label,
        success: false,
        message: err instanceof Error ? err.message : 'Network error',
      })
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
              <div key={d.nodeId} className="flex-1 min-w-[240px] rounded-lg border border-gray-800 bg-gray-900 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-gray-300">{d.name}</span>
                  <div className="flex items-center gap-2">
                    {rate !== null && rate !== 0 && (
                      <span className={`text-xs ${rate > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                        {formatGrowthRate(rate)}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{usedPct}% used</span>
                  </div>
                </div>
                <div className="flex h-2 rounded-full bg-gray-800 overflow-hidden">
                  <div className="bg-blue-500" style={{ width: `${recPct}%` }} title={`Recordings: ${formatBytes(d.recordings)}`} />
                  <div className={usedPct > 90 ? 'bg-red-500' : usedPct > 75 ? 'bg-yellow-500' : 'bg-amber-700'} style={{ width: `${otherPct}%` }} title={`Other: ${formatBytes(d.used - d.recordings)}`} />
                </div>
                <div className="mt-1.5 flex gap-3 text-xs text-gray-500">
                  <span><span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />Recordings {formatBytes(d.recordings)}</span>
                  <span><span className={`inline-block w-2 h-2 rounded-full ${usedPct > 90 ? 'bg-red-500' : usedPct > 75 ? 'bg-yellow-500' : 'bg-amber-700'} mr-1`} />Other {formatBytes(Math.max(0, d.used - d.recordings))}</span>
                  <span className="ml-auto flex gap-3">
                    {ttf !== null && (
                      <span className={`${ttf < 3600 ? 'text-red-400' : ttf < 86400 ? 'text-yellow-400' : 'text-gray-500'}`}>
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
          <span className="text-xs font-medium text-gray-500 w-10">Node</span>
          {nodeIds.map((id) => (
            <button
              key={id}
              onClick={() => setFilterNode(filterNode === id ? null : id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filterNode === id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-gray-200'
              }`}
            >
              {nodeName(id, nodes.get(id)?.agentMode)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 w-10">Type</span>
          {recordingTypes.map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(filterType === t ? null : t)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filterType === t
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-gray-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Global Archive Actions */}
      {filterNode !== null && (
        <div className="flex flex-wrap gap-2">
          <button
            disabled={loading !== null}
            onClick={() => executeAction('Verify Archive', filterNode, 'archive/verify', 'GET')}
            title="Check archive integrity by verifying the catalog and all recording segment files"
            className="rounded-md bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-700 disabled:opacity-50"
          >
            {loading === 'Verify Archive' ? 'Verifying...' : 'Verify Archive'}
          </button>
          <button
            disabled={loading !== null}
            onClick={() => withConfirm('Compact Archive', () => executeAction('Compact Archive', filterNode, 'archive/compact'))}
            title="Remove deleted and invalidated recording segments to reclaim disk space"
            className="rounded-md bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-700 disabled:opacity-50"
          >
            Compact
          </button>
          <button
            disabled={loading !== null}
            onClick={() => withConfirm('Delete Orphaned Segments', () => executeAction('Delete Orphaned', filterNode, 'archive/delete-orphaned'))}
            title="Delete segment files on disk that are not referenced by any recording in the catalog"
            className="rounded-md bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-700 disabled:opacity-50"
          >
            Delete Orphaned
          </button>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmAction && (
        <div className="rounded-lg border border-yellow-800 bg-yellow-900/20 p-4">
          <p className="text-sm text-yellow-200">
            Confirm: <strong>{confirmAction.label}</strong>?
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => { confirmAction.fn(); setConfirmAction(null) }}
              className="rounded-md bg-yellow-700 px-3 py-1 text-xs font-medium text-white hover:bg-yellow-600"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirmAction(null)}
              className="rounded-md bg-gray-700 px-3 py-1 text-xs font-medium text-gray-300 hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Action Result */}
      {actionResult && (
        <div
          className={`rounded-lg border p-4 ${
            actionResult.success
              ? 'border-green-800 bg-green-900/20'
              : 'border-red-800 bg-red-900/20'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-sm font-medium ${actionResult.success ? 'text-green-300' : 'text-red-300'}`}>
              {actionResult.action}: {actionResult.message}
            </span>
            <button onClick={() => setActionResult(null)} className="text-gray-500 hover:text-gray-300 text-xs">
              dismiss
            </button>
          </div>
          {actionResult.output && (
            <pre className="mt-2 max-h-60 overflow-auto rounded bg-gray-950 p-3 text-xs text-gray-300">
              {actionResult.output}
            </pre>
          )}
        </div>
      )}

      {/* Summary + Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">
          {fetchLoading ? 'Loading...' : `${totalElements.toLocaleString()} recordings`}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
              className="rounded-md bg-gray-800 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700 disabled:opacity-30"
            >
              Prev
            </button>
            <span className="text-xs text-gray-400">
              {page + 1} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(page + 1)}
              className="rounded-md bg-gray-800 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Recordings Table */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 border-b border-gray-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Node
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Recording ID
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Stream
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Channel
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Start Pos
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Stop Pos
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Size
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Started
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Stopped
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {recordings.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-gray-500">
                  {fetchLoading ? 'Loading recordings...' : 'No recordings available'}
                </td>
              </tr>
            ) : (
              recordings.map((rec) => {
                const isActive = rec.stopPosition === -1 || rec.stopTimestamp === 0
                const size = isActive ? rec.stopPosition : rec.stopPosition - rec.startPosition
                const isInvalid = rec.state === 'INVALID'
                const isDeleted = rec.state === 'DELETED'
                const rowClass = isInvalid || isDeleted ? 'hover:bg-gray-800/50 opacity-60' : 'hover:bg-gray-800/50'
                return (
                  <tr key={`${rec.nodeId}-${rec.recordingId}`} className={rowClass}>
                    <td className="px-4 py-2 text-gray-200">{nodeName(rec.nodeId, nodes.get(rec.nodeId)?.agentMode)}</td>
                    <td className="px-4 py-2 font-mono text-gray-200">
                      {rec.recordingId}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${typeBadgeClass(rec.type)}`}>
                        {rec.type}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-gray-400">
                      {rec.streamId}
                    </td>
                    <td className="px-4 py-2 text-gray-400 max-w-xs truncate">
                      {rec.channel}
                    </td>
                    <td className="px-4 py-2 font-mono text-gray-400">
                      {rec.startPosition.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 font-mono text-gray-400">
                      {isActive ? '\u2014' : rec.stopPosition.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 font-mono text-gray-400">
                      {size > 0 ? formatBytes(size) : '\u2014'}
                    </td>
                    <td className="px-4 py-2 text-gray-400 whitespace-nowrap">
                      {formatTimestamp(rec.startTimestamp)}
                    </td>
                    <td className="px-4 py-2 text-gray-400 whitespace-nowrap">
                      {formatTimestamp(rec.stopTimestamp)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        {isInvalid ? (
                          <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-red-900/50 text-red-300">
                            INVALID
                          </span>
                        ) : isDeleted ? (
                          <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-red-900/50 text-red-400">
                            DELETED
                          </span>
                        ) : isActive ? (
                          <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-green-900/50 text-green-300">
                            ACTIVE
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-gray-700 text-gray-300">
                            STOPPED
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        <button
                          disabled={loading !== null}
                          onClick={() => executeAction(
                            `Describe #${rec.recordingId}`,
                            rec.nodeId,
                            `archive/recordings/${rec.recordingId}/describe`,
                            'GET',
                          )}
                          title="Show recording metadata: channel, stream, positions, and segment file details"
                          className="rounded px-2 py-0.5 text-xs font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-gray-600 hover:bg-gray-500"
                        >
                          Describe
                        </button>
                        <button
                          disabled={loading !== null}
                          onClick={() => executeAction(
                            `Verify #${rec.recordingId}`,
                            rec.nodeId,
                            `archive/recordings/${rec.recordingId}/verify`,
                            'GET',
                          )}
                          title="Verify this recording's segment files are intact and checksums are valid"
                          className="rounded px-2 py-0.5 text-xs font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-gray-600 hover:bg-gray-500"
                        >
                          Verify
                        </button>
                        <button
                          disabled={loading !== null}
                          onClick={() => withConfirm(
                            `Mark recording ${rec.recordingId} invalid`,
                            () => executeAction(
                              `Mark Invalid #${rec.recordingId}`,
                              rec.nodeId,
                              `archive/recordings/${rec.recordingId}/mark-invalid`,
                            ),
                          )}
                          title="Mark this recording as invalid in the catalog. It will be skipped during recovery and eligible for compaction"
                          className="rounded px-2 py-0.5 text-xs font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-orange-600 hover:bg-orange-500"
                        >
                          Invalidate
                        </button>
                        <button
                          disabled={loading !== null}
                          onClick={() => withConfirm(
                            `Mark recording ${rec.recordingId} valid`,
                            () => executeAction(
                              `Mark Valid #${rec.recordingId}`,
                              rec.nodeId,
                              `archive/recordings/${rec.recordingId}/mark-valid`,
                            ),
                          )}
                          title="Restore a previously invalidated recording back to valid state in the catalog"
                          className="rounded px-2 py-0.5 text-xs font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-green-600 hover:bg-green-500"
                        >
                          Validate
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
