import { useEffect, useState, useMemo } from 'react'
import { useClusterStore } from '../stores/clusterStore'
import { useWebSocket } from '../hooks/useWebSocket'
import { ArchiveRecording, ClusterOverview } from '../types'

type RecordingType = 'LOG' | 'SNAPSHOT' | 'OTHER'

interface RecordingRow extends ArchiveRecording {
  nodeId: number
  type: RecordingType
}

interface ActionResult {
  action: string
  success: boolean
  message: string
  output?: string
}

function nodeName(nodeId: number, agentMode?: string) {
  return agentMode === 'backup' ? 'Backup' : `Node ${nodeId}`
}

function recordingType(channel: string): RecordingType {
  const match = channel.match(/\balias=(\w+)/)
  if (!match) return 'OTHER'
  const alias = match[1].toLowerCase()
  if (alias === 'log') return 'LOG'
  if (alias === 'snapshot') return 'SNAPSHOT'
  return 'OTHER'
}

const typeBadgeClass: Record<RecordingType, string> = {
  LOG: 'bg-blue-900/50 text-blue-300',
  SNAPSHOT: 'bg-purple-900/50 text-purple-300',
  OTHER: 'bg-gray-700 text-gray-300',
}

const RECORDING_TYPES: RecordingType[] = ['LOG', 'SNAPSHOT', 'OTHER']

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

  useEffect(() => {
    fetch('/api/cluster')
      .then((res) => res.json())
      .then((data: ClusterOverview) => updateCluster(data))
      .catch(() => {})
  }, [updateCluster])

  const allRecordings = useMemo(() => {
    const rows: RecordingRow[] = []
    for (const [nodeId, metrics] of nodes) {
      if (metrics.recordings) {
        for (const rec of metrics.recordings) {
          rows.push({ ...rec, nodeId, type: recordingType(rec.channel) })
        }
      }
    }
    return rows.sort((a, b) => a.recordingId - b.recordingId)
  }, [nodes])

  const filtered = useMemo(() => {
    let rows = allRecordings
    if (filterNode !== null) rows = rows.filter((r) => r.nodeId === filterNode)
    if (filterType !== null) rows = rows.filter((r) => r.type === filterType)
    setPage(0)
    return rows
  }, [allRecordings, filterNode, filterType])

  const totalPages = Math.ceil(filtered.length / pageSize)
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize)

  const nodeIds = useMemo(
    () => Array.from(nodes.keys()).sort((a, b) => a - b),
    [nodes],
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

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
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
        <div className="flex flex-wrap gap-2">
          {RECORDING_TYPES.map((t) => (
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
            className="rounded-md bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-700 disabled:opacity-50"
          >
            {loading === 'Verify Archive' ? 'Verifying...' : 'Verify Archive'}
          </button>
          <button
            disabled={loading !== null}
            onClick={() => withConfirm('Compact Archive', () => executeAction('Compact Archive', filterNode, 'archive/compact'))}
            className="rounded-md bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-700 disabled:opacity-50"
          >
            Compact
          </button>
          <button
            disabled={loading !== null}
            onClick={() => withConfirm('Delete Orphaned Segments', () => executeAction('Delete Orphaned', filterNode, 'archive/delete-orphaned'))}
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
          {filtered.length.toLocaleString()} recordings
          {filtered.length !== allRecordings.length && ` (of ${allRecordings.length.toLocaleString()})`}
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
            {paged.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-gray-500">
                  No recordings available
                </td>
              </tr>
            ) : (
              paged.map((rec) => {
                const isActive = rec.stopPosition === -1 || rec.stopTimestamp === 0
                return (
                  <tr key={`${rec.nodeId}-${rec.recordingId}`} className="hover:bg-gray-800/50">
                    <td className="px-4 py-2 text-gray-200">{nodeName(rec.nodeId, nodes.get(rec.nodeId)?.agentMode)}</td>
                    <td className="px-4 py-2 font-mono text-gray-200">
                      {rec.recordingId}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${typeBadgeClass[rec.type]}`}>
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
                    <td className="px-4 py-2 text-gray-400 whitespace-nowrap">
                      {formatTimestamp(rec.startTimestamp)}
                    </td>
                    <td className="px-4 py-2 text-gray-400 whitespace-nowrap">
                      {formatTimestamp(rec.stopTimestamp)}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          isActive
                            ? 'bg-green-900/50 text-green-300'
                            : 'bg-gray-700 text-gray-300'
                        }`}
                      >
                        {isActive ? 'ACTIVE' : 'STOPPED'}
                      </span>
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
                          className="rounded px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-700 hover:text-gray-200 disabled:opacity-50"
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
                          className="rounded px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-700 hover:text-gray-200 disabled:opacity-50"
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
                          className="rounded px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-700 hover:text-gray-200 disabled:opacity-50"
                        >
                          Invalidate
                        </button>
                        <button
                          disabled={loading !== null}
                          onClick={() => withConfirm(
                            `Delete recording ${rec.recordingId}`,
                            () => executeAction(
                              `Delete #${rec.recordingId}`,
                              rec.nodeId,
                              `archive/recordings/${rec.recordingId}/delete`,
                            ),
                          )}
                          className="rounded px-2 py-0.5 text-xs text-red-400 hover:bg-red-900/30 hover:text-red-300 disabled:opacity-50"
                        >
                          Delete
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
