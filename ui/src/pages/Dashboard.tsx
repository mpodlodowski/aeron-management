import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useClusterStore } from '../stores/clusterStore'
import { useWebSocket } from '../hooks/useWebSocket'
import NodeCard from '../components/NodeCard'
import { EventsTimeline } from '../components/events/EventsTimeline'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { StatusBanner } from '../components/StatusBanner'
import { formatNsAsMs } from '../utils/counters'

export default function Dashboard() {
  const { clusterId } = useParams<{ clusterId: string }>()
  useWebSocket(clusterId)
  const cluster = useClusterStore((s) => s.clusters.get(clusterId ?? ''))
  const nodes = cluster?.nodes ?? new Map()
  const leaderNodeId = cluster?.leaderNodeId ?? null
  const clusterState = cluster?.clusterState ?? null
  const clusterStats = cluster?.clusterStats ?? null
  const [loading, setLoading] = useState<string | null>(null)
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
    try {
      const res = await fetch(`/api/clusters/${clusterId}/${endpoint}`, { method: 'POST' })
      const data = await res.json()
      if (data.success !== false) {
        toast.success(`${label}: ${data.message ?? 'Action completed'}`)
      } else {
        toast.error(`${label}: ${data.message ?? 'Action failed'}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error'
      toast.error(`${label}: ${message}`)
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
    try {
      const res = await fetch(
        `/api/clusters/${clusterId}/egress-recording/start?durationSeconds=${duration}`,
        { method: 'POST' }
      )
      const data = await res.json()
      if (data.success !== false) {
        toast.success(`Record Egress: ${data.message ?? 'Recording started on leader'}`)
      } else {
        toast.error(`Record Egress: ${data.message ?? 'Failed to start recording'}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error'
      toast.error(`Record Egress: ${message}`)
    } finally {
      setLoading(null)
    }
  }

  async function stopClusterRecording() {
    setLoading('Stop Record')
    try {
      const res = await fetch(`/api/clusters/${clusterId}/egress-recording/stop`, { method: 'POST' })
      const data = await res.json()
      if (data.success !== false) {
        toast.success(`Stop Recording: ${data.message ?? 'Recording stopped'}`)
      } else {
        toast.error(`Stop Recording: ${data.message ?? 'Failed to stop recording'}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error'
      toast.error(`Stop Recording: ${message}`)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      <StatusBanner
        clusterState={clusterState}
        downNodes={sortedNodes
          .filter(n => n.agentConnected !== false && n.cncAccessible !== false && n.nodeReachable === false)
          .map(n => n.nodeId)}
        onResume={() => clusterAction('Resume', 'resume')}
      />

      {/* Cluster Overview */}
      {cs && (
        <div className="rounded-lg border border-border-subtle bg-surface p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium text-text-secondary">Cluster Overview</h2>
              {clusterState && (
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <span className={`inline-block h-2 w-2 rounded-full ${
                    clusterState === 'ACTIVE' ? 'bg-success-text' :
                    clusterState === 'SUSPENDED' ? 'bg-warning-text' :
                    clusterState === 'SNAPSHOT' ? 'bg-info-text' :
                    clusterState === 'INIT' ? 'bg-text-muted' :
                    'bg-critical-text'
                  }`} />
                  <span className="text-text-secondary">{clusterState}</span>
                </span>
              )}
            </div>
            {cs.aeronVersion && (
              <span className="text-xs text-text-muted">Aeron {cs.aeronVersion}</span>
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
          <div className="mt-3 pt-3 border-t border-border-subtle flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-text-muted mr-1">Actions</span>
            <button
              disabled={loading !== null}
              onClick={() => clusterAction('Snapshot', 'snapshot')}
              title="Trigger a cluster snapshot to compact the log and create a recovery point"
              className="rounded border border-border-medium px-2.5 py-1 text-xs font-medium text-text-primary hover:bg-elevated transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading === 'Snapshot' ? '...' : 'Snapshot'}
            </button>
            <button
              disabled={loading !== null}
              onClick={() => withConfirm('Suspend', () => clusterAction('Suspend', 'suspend'))}
              title="Suspend cluster log processing. The cluster will stop accepting new commands until resumed"
              className="rounded border border-border-medium px-2.5 py-1 text-xs font-medium text-text-primary hover:bg-elevated transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Suspend
            </button>
            <button
              disabled={loading !== null}
              onClick={() => clusterAction('Resume', 'resume')}
              title="Resume cluster log processing after a suspend"
              className="rounded border border-border-medium px-2.5 py-1 text-xs font-medium text-text-primary hover:bg-elevated transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading === 'Resume' ? '...' : 'Resume'}
            </button>
            <button
              disabled={loading !== null}
              onClick={() => withConfirm('Shutdown', () => clusterAction('Shutdown', 'shutdown'))}
              title="Gracefully shut down the cluster. Takes a snapshot before stopping all nodes"
              className="rounded border border-critical-fill/40 px-2.5 py-1 text-xs font-medium text-critical-text hover:bg-critical-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Shutdown
            </button>
            <button
              disabled={loading !== null}
              onClick={() => withConfirm('Abort', () => clusterAction('Abort', 'abort'))}
              title="Immediately abort the cluster without taking a snapshot. Use only as a last resort"
              className="rounded border border-critical-fill/40 px-2.5 py-1 text-xs font-medium text-critical-text hover:bg-critical-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Abort
            </button>
            {anyNodeRecording ? (
              <button
                disabled={loading !== null}
                onClick={stopClusterRecording}
                title="Stop egress recording on the leader"
                className="rounded border border-critical-fill/40 px-2.5 py-1 text-xs font-medium text-critical-text hover:bg-critical-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-critical-text animate-pulse" />
                {loading === 'Stop Record' ? '...' : 'Stop Recording'}
              </button>
            ) : (
              <button
                disabled={loading !== null}
                onClick={() => setShowRecordingDialog(true)}
                title="Start spy recording of egress (stream 102) on the leader"
                className="rounded border border-border-medium px-2.5 py-1 text-xs font-medium text-text-primary hover:bg-elevated transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Record Egress
              </button>
            )}
          </div>

          {showRecordingDialog && (
            <div className="mt-2 rounded-lg border border-border-subtle bg-surface p-3">
              <p className="text-sm text-text-secondary mb-2">Start egress recording on the leader node</p>
              <div className="flex items-center gap-2">
                <label className="text-xs text-text-muted">Duration (seconds, 0=unlimited):</label>
                <input
                  type="number"
                  value={recordingDuration}
                  onChange={(e) => setRecordingDuration(e.target.value)}
                  placeholder="60"
                  className="w-24 rounded border border-border-subtle bg-canvas px-2 py-1 text-xs text-text-primary"
                />
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={startClusterRecording}
                  className="rounded-md bg-info-fill text-white hover:bg-info-fill/80 px-3 py-1 text-xs font-medium"
                >
                  Start
                </button>
                <button
                  onClick={() => setShowRecordingDialog(false)}
                  className="rounded-md bg-elevated border border-border-medium text-text-primary hover:bg-border-subtle px-3 py-1 text-xs font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Node Cards */}
      {sortedNodes.length === 0 ? (
        <div className="text-text-muted">
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

      <EventsTimeline clusterId={clusterId!} />

      <ConfirmDialog
        open={confirmAction !== null}
        title={`${confirmAction?.label}?`}
        description={
          confirmAction?.label === 'Shutdown' ? 'This will gracefully shut down the cluster after taking a snapshot.' :
          confirmAction?.label === 'Abort' ? 'This will immediately abort the cluster without a snapshot. Use only as a last resort.' :
          undefined
        }
        destructive={confirmAction?.label === 'Shutdown' || confirmAction?.label === 'Abort'}
        onConfirm={() => { confirmAction?.fn(); setConfirmAction(null) }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  )
}

function StatCard({ label, value, alert, tooltip }: { label: string; value: string; alert?: boolean; tooltip?: string }) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${alert ? 'border-critical-fill/40 bg-critical-surface' : 'border-border-subtle bg-canvas'} ${tooltip ? 'cursor-help' : ''}`}
      title={tooltip}
    >
      <div className="text-xs text-text-muted mb-0.5">{label}</div>
      <div className={`text-sm font-mono truncate ${alert ? 'text-critical-text' : 'text-text-primary'}`}>{value}</div>
    </div>
  )
}
