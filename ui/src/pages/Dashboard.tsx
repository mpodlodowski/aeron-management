import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useClusterStore } from '../stores/clusterStore'
import { useWebSocket } from '../hooks/useWebSocket'
import NodeCard from '../components/NodeCard'
import EventLog from '../components/EventLog'
import { formatNsAsMs } from '../utils/counters'

interface ActionResult {
  action: string
  success: boolean
  message: string
}

export default function Dashboard() {
  const { clusterId } = useParams<{ clusterId: string }>()
  useWebSocket(clusterId)
  const cluster = useClusterStore((s) => s.clusters.get(clusterId ?? ''))
  const nodes = cluster?.nodes ?? new Map()
  const leaderNodeId = cluster?.leaderNodeId ?? null
  const clusterState = cluster?.clusterState ?? null
  const clusterStats = cluster?.clusterStats ?? null
  const alerts = cluster?.alerts ?? []
  const [loading, setLoading] = useState<string | null>(null)
  const [actionResult, setActionResult] = useState<ActionResult | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ label: string; fn: () => void } | null>(null)
  const [recordingDuration, setRecordingDuration] = useState('60')
  const [showRecordingDialog, setShowRecordingDialog] = useState(false)

  const sortedNodes = Array.from(nodes.values()).sort((a, b) => {
    const aIsBackup = a.agentMode === 'backup' ? 1 : 0
    const bIsBackup = b.agentMode === 'backup' ? 1 : 0
    if (aIsBackup !== bIsBackup) return aIsBackup - bIsBackup
    return a.nodeId - b.nodeId
  })

  const cs = clusterStats

  async function clusterAction(label: string, endpoint: string) {
    setLoading(label)
    setActionResult(null)
    try {
      const res = await fetch(`/api/clusters/${clusterId}/${endpoint}`, { method: 'POST' })
      const data = await res.json()
      setActionResult({
        action: label,
        success: data.success !== false,
        message: data.message ?? (data.success !== false ? 'Action completed' : 'Action failed'),
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

  const anyNodeRecording = Array.from(nodes.values()).some(n => n.egressRecording?.active)

  async function startClusterRecording() {
    const duration = recordingDuration ? parseInt(recordingDuration) : 0
    setShowRecordingDialog(false)
    setLoading('Record')
    setActionResult(null)
    try {
      const res = await fetch(
        `/api/clusters/${clusterId}/egress-recording/start?durationSeconds=${duration}`,
        { method: 'POST' }
      )
      const data = await res.json()
      setActionResult({
        action: 'Record Egress',
        success: data.success !== false,
        message: data.message ?? (data.success !== false ? 'Recording started on leader' : 'Failed to start recording'),
      })
    } catch (err) {
      setActionResult({
        action: 'Record Egress',
        success: false,
        message: err instanceof Error ? err.message : 'Network error',
      })
    } finally {
      setLoading(null)
    }
  }

  async function stopClusterRecording() {
    setLoading('Stop Record')
    setActionResult(null)
    try {
      const res = await fetch(`/api/clusters/${clusterId}/egress-recording/stop`, { method: 'POST' })
      const data = await res.json()
      setActionResult({
        action: 'Stop Recording',
        success: data.success !== false,
        message: data.message ?? (data.success !== false ? 'Recording stopped' : 'Failed to stop recording'),
      })
    } catch (err) {
      setActionResult({
        action: 'Stop Recording',
        success: false,
        message: err instanceof Error ? err.message : 'Network error',
      })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Suspended Banner */}
      {clusterState === 'SUSPENDED' && (
        <div className="rounded-lg border border-yellow-700 bg-yellow-900/30 px-4 py-3 flex items-center gap-3">
          <span className="inline-flex rounded-full bg-yellow-600 px-2.5 py-0.5 text-xs font-bold text-white">SUSPENDED</span>
          <span className="text-sm text-yellow-200">Cluster is suspended — log processing is paused. Resume from the leader node to accept new commands.</span>
        </div>
      )}

      {/* Cluster Overview */}
      {cs && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium text-gray-300">Cluster Overview</h2>
              {clusterState && (
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium text-white ${
                  clusterState === 'ACTIVE' ? 'bg-green-600' :
                  clusterState === 'SUSPENDED' ? 'bg-yellow-600' :
                  clusterState === 'SNAPSHOT' ? 'bg-blue-600' :
                  clusterState === 'INIT' ? 'bg-gray-500' :
                  'bg-red-600'
                }`}>
                  {clusterState}
                </span>
              )}
            </div>
            {cs.aeronVersion && (
              <span className="text-xs text-gray-500">Aeron {cs.aeronVersion}</span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {cs.clusterStartMs != null && cs.clusterStartMs > 0 && (
              <StatCard label="Start Time" value={new Date(cs.clusterStartMs).toLocaleString()} tooltip="Time when the earliest log recording was created (cluster creation)" />
            )}
            <StatCard
              label="Clients"
              value={String(cs.connectedClients)}
              tooltip="Number of client sessions connected to the cluster leader"
            />
            <StatCard
              label="Leadership Term"
              value={String(cs.leadershipTermId ?? '\u2014')}
              tooltip="Current leadership term ID. Increments with each leader election"
            />
            <StatCard
              label="Elections"
              value={String(cs.totalElections)}
              tooltip="Total leader elections across the cluster lifetime"
            />
            <StatCard
              label="Snapshots"
              value={String(cs.totalSnapshots)}
              tooltip="Number of snapshots taken for log compaction and recovery"
            />
            <StatCard
              label="Max Cycle Time"
              value={formatNsAsMs(cs.maxCycleTimeNs)}
              tooltip="Worst-case duty cycle time across all nodes"
            />
          </div>

          {/* Cluster Admin Actions */}
          <div className="mt-3 pt-3 border-t border-gray-800 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-gray-500 mr-1">Actions</span>
            <button
              disabled={loading !== null}
              onClick={() => clusterAction('Snapshot', 'snapshot')}
              title="Trigger a cluster snapshot to compact the log and create a recovery point"
              className="rounded px-2.5 py-1 text-xs font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500"
            >
              {loading === 'Snapshot' ? '...' : 'Snapshot'}
            </button>
            <button
              disabled={loading !== null}
              onClick={() => withConfirm('Suspend', () => clusterAction('Suspend', 'suspend'))}
              title="Suspend cluster log processing. The cluster will stop accepting new commands until resumed"
              className="rounded px-2.5 py-1 text-xs font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-yellow-600 hover:bg-yellow-500"
            >
              Suspend
            </button>
            <button
              disabled={loading !== null}
              onClick={() => clusterAction('Resume', 'resume')}
              title="Resume cluster log processing after a suspend"
              className="rounded px-2.5 py-1 text-xs font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-green-600 hover:bg-green-500"
            >
              {loading === 'Resume' ? '...' : 'Resume'}
            </button>
            <button
              disabled={loading !== null}
              onClick={() => withConfirm('Shutdown', () => clusterAction('Shutdown', 'shutdown'))}
              title="Gracefully shut down the cluster. Takes a snapshot before stopping all nodes"
              className="rounded px-2.5 py-1 text-xs font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-red-600 hover:bg-red-500"
            >
              Shutdown
            </button>
            <button
              disabled={loading !== null}
              onClick={() => withConfirm('Abort', () => clusterAction('Abort', 'abort'))}
              title="Immediately abort the cluster without taking a snapshot. Use only as a last resort"
              className="rounded px-2.5 py-1 text-xs font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-red-700 hover:bg-red-600"
            >
              Abort
            </button>
            {anyNodeRecording ? (
              <button
                disabled={loading !== null}
                onClick={stopClusterRecording}
                title="Stop egress recording on the leader"
                className="rounded px-2.5 py-1 text-xs font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-purple-700 hover:bg-purple-600 flex items-center gap-1"
              >
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                {loading === 'Stop Record' ? '...' : 'Stop Recording'}
              </button>
            ) : (
              <button
                disabled={loading !== null}
                onClick={() => setShowRecordingDialog(true)}
                title="Start spy recording of egress (stream 102) on the leader"
                className="rounded px-2.5 py-1 text-xs font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-purple-600 hover:bg-purple-500"
              >
                Record Egress
              </button>
            )}
          </div>

          {/* Confirm Dialog */}
          {confirmAction && (
            <div className="mt-2 rounded-lg border border-yellow-800 bg-yellow-900/20 p-3">
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

          {showRecordingDialog && (
            <div className="mt-2 rounded-lg border border-purple-800 bg-purple-900/20 p-3">
              <p className="text-sm text-purple-200 mb-2">Start egress recording on the leader node</p>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400">Duration (seconds, 0=unlimited):</label>
                <input
                  type="number"
                  value={recordingDuration}
                  onChange={(e) => setRecordingDuration(e.target.value)}
                  placeholder="60"
                  className="w-24 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200"
                />
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={startClusterRecording}
                  className="rounded-md bg-purple-700 px-3 py-1 text-xs font-medium text-white hover:bg-purple-600"
                >
                  Start
                </button>
                <button
                  onClick={() => setShowRecordingDialog(false)}
                  className="rounded-md bg-gray-700 px-3 py-1 text-xs font-medium text-gray-300 hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Action Result */}
          {actionResult && (
            <div className={`mt-2 rounded-md px-3 py-2 text-sm flex items-center justify-between ${
              actionResult.success
                ? 'bg-green-900/50 text-green-300 border border-green-800'
                : 'bg-red-900/50 text-red-300 border border-red-800'
            }`}>
              <span><span className="font-medium">{actionResult.action}:</span> {actionResult.message}</span>
              <button onClick={() => setActionResult(null)} className="text-gray-500 hover:text-gray-300 text-xs ml-2">dismiss</button>
            </div>
          )}
        </div>
      )}

      {/* Node Cards */}
      {sortedNodes.length === 0 ? (
        <div className="text-gray-500">
          No nodes reporting. Waiting for cluster data...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {sortedNodes.map((metrics) => (
            <NodeCard
              key={metrics.nodeId}
              metrics={metrics}
              isLeader={metrics.nodeId === leaderNodeId}
              clusterId={clusterId!}
            />
          ))}
        </div>
      )}

      <EventLog alerts={alerts} />
    </div>
  )
}

function StatCard({ label, value, alert, tooltip }: { label: string; value: string; alert?: boolean; tooltip?: string }) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${alert ? 'border-red-800 bg-red-900/20' : 'border-gray-800 bg-gray-950'} ${tooltip ? 'cursor-help' : ''}`}
      title={tooltip}
    >
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <div className={`text-sm font-mono truncate ${alert ? 'text-red-400' : 'text-gray-200'}`}>{value}</div>
    </div>
  )
}
