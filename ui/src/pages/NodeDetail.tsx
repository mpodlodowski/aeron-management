import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useClusterStore } from '../stores/clusterStore'
import { useWebSocket } from '../hooks/useWebSocket'
import CounterTable from '../components/CounterTable'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DiskDonut } from '../components/DiskDonut'
import { totalErrors, counterByType, counterByLabel, formatBytes, formatNsAsMs, backupStateName, COUNTER_TYPE } from '../utils/counters'

export default function NodeDetail() {
  const { clusterId, nodeId } = useParams<{ clusterId: string; nodeId: string }>()
  useWebSocket(clusterId)
  const id = Number(nodeId)
  const nodes = useClusterStore((s) => s.clusters.get(clusterId ?? '')?.nodes ?? new Map())
  const metrics = nodes.get(id)
  const isBackup = metrics?.agentMode === 'backup'
  const [actionResult, setActionResult] = useState<{ action: string; output?: string } | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ label: string; description: string; fn: () => void } | null>(null)
  const [recordingStreamId, setRecordingStreamId] = useState('102')
  const [recordingDuration, setRecordingDuration] = useState('60')

  // Initial node data is delivered via WebSocket on subscribe (see WebSocketSubscriptionHandler)

  async function executeAction(action: string, endpoint: string, method: 'POST' | 'GET' = 'POST') {
    setLoading(action)
    try {
      const res = await fetch(`/api/clusters/${clusterId}/nodes/${id}/${endpoint}`, { method })
      const data = await res.json()
      const message = data.message ?? (res.ok ? 'Action completed' : 'Action failed')
      if (res.ok) {
        toast.success(message)
        if (data.output) {
          setActionResult({ action, output: data.output })
        } else {
          setActionResult(null)
        }
      } else {
        toast.error(message)
        setActionResult(null)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error')
      setActionResult(null)
    } finally {
      setLoading(null)
    }
  }

  if (!metrics) {
    return (
      <div className="text-text-muted">
        No data available for Node {id}. Waiting for metrics...
      </div>
    )
  }

  const { clusterMetrics, counters } = metrics
  const isLeader = clusterMetrics?.nodeRole === 'LEADER'
  const c = counters ?? []
  const errors = totalErrors(c)
  const snapshots = counterByType(c, COUNTER_TYPE.SNAPSHOT_COUNT)?.value ?? 0
  const electionCount = counterByType(c, COUNTER_TYPE.ELECTION_COUNT)?.value ?? 0
  const maxCycleNs = counterByType(c, COUNTER_TYPE.MAX_CYCLE_TIME_NS)?.value ?? 0
  const sentPerSec = metrics.bytesSentPerSec ?? 0
  const recvPerSec = metrics.bytesRecvPerSec ?? 0
  const bytesMapped = counterByLabel(c, 'Bytes currently mapped')?.value ?? 0

  const actions = [
    { id: 'INVALIDATE_SNAPSHOT', label: 'Invalidate Snapshot', endpoint: 'invalidate-snapshot', tooltip: 'Mark the latest snapshot as invalid so the node recovers from the log on next restart', description: 'This marks the latest snapshot as invalid. On next restart, the node will recover from the consensus log instead of the snapshot. Use this when you suspect snapshot corruption.' },
    { id: 'SEED_RECORDING_LOG', label: 'Seed Recording Log', endpoint: 'seed-recording-log', tooltip: 'Rebuild recording log from the latest valid snapshot. Use when the node fails to start due to missing recordings.', description: 'This rebuilds the recording log from the latest valid snapshot. Existing recording log entries will be replaced. Use this when the node fails to start due to missing or corrupt recording log.' },
  ]

  const diagnostics = [
    { id: 'DESCRIBE', label: 'Describe', endpoint: 'describe', tooltip: 'Show cluster node configuration and current state' },
    { id: 'PID', label: 'PID', endpoint: 'pid', tooltip: 'Get the process ID of the cluster node' },
    { id: 'RECORDING_LOG', label: 'Recording Log', endpoint: 'recording-log', tooltip: 'List the cluster recording log entries (snapshots and log recordings used for consensus)' },
    { id: 'ERRORS', label: 'Errors', endpoint: 'errors', tooltip: 'Show the distinct error log from the cluster media driver' },
    { id: 'LIST_MEMBERS', label: 'List Members', endpoint: 'list-members', tooltip: 'List all cluster members with their endpoints and log positions' },
    { id: 'IS_LEADER', label: 'Is Leader', endpoint: 'is-leader', tooltip: 'Check whether this node is currently the cluster leader' },
    { id: 'DESCRIBE_SNAPSHOT', label: 'Describe Snapshot', endpoint: 'describe-snapshot', tooltip: 'Show metadata of the latest snapshot recording' },
  ]

  return (
    <div className="space-y-6">
      {/* Summary Cards + Disk */}
      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {isBackup ? (<>
          <SummaryCard
            label="Live Log Position"
            value={(counterByType(c, COUNTER_TYPE.BACKUP_LIVE_LOG_POSITION)?.value ?? 0).toLocaleString()}
            tooltip="Current position in the live log being replicated from the cluster leader"
          />
          <SummaryCard
            label="Backup State"
            value={backupStateName(counterByType(c, COUNTER_TYPE.BACKUP_STATE)?.value ?? -1)}
            alert={(counterByType(c, COUNTER_TYPE.BACKUP_STATE)?.value ?? -1) !== 5}
            tooltip="ClusterBackup state. BACKING_UP (5) is the normal operational state indicating active replication"
          />
          <SummaryCard
            label="Backup Errors"
            value={String(counterByType(c, COUNTER_TYPE.BACKUP_ERRORS)?.value ?? 0)}
            alert={(counterByType(c, COUNTER_TYPE.BACKUP_ERRORS)?.value ?? 0) > 0}
            tooltip="ClusterBackup error count. Non-zero indicates replication issues"
          />
          <SummaryCard
            label="Recordings"
            value={String(metrics.recordingCount ?? 0)}
            tooltip="Number of archive recordings on the backup node"
          />
          <SummaryCard
            label="Traffic"
            value={`\u2191${formatBytes(sentPerSec)}/s \u2193${formatBytes(recvPerSec)}/s`}
            tooltip="Current network throughput (bytes/sec) of the Aeron media driver on this node"
          />
          <SummaryCard
            label="Mapped Memory"
            value={formatBytes(bytesMapped)}
            tooltip="Total bytes of memory-mapped files used by the Aeron media driver (log buffers, CnC, etc.)"
          />
          {metrics.systemMetrics && metrics.systemMetrics.archiveDiskTotalBytes > 0 && (
            <DiskDonut
              label="Archive Disk"
              recordings={metrics.recordingsTotalBytes ?? 0}
              used={metrics.systemMetrics.archiveDiskUsedBytes}
              total={metrics.systemMetrics.archiveDiskTotalBytes}
              growth={metrics.diskGrowth}
              compact
              className="w-full lg:col-span-2"
            />
          )}
          {metrics.systemMetrics && metrics.systemMetrics.shmDiskTotalBytes > 0 && (
            <DiskDonut
              label="SHM"
              recordings={0}
              used={metrics.systemMetrics.shmDiskUsedBytes}
              total={metrics.systemMetrics.shmDiskTotalBytes}
              compact
              className="w-full lg:col-span-2"
            />
          )}
        </>) : (<>
          <SummaryCard
            label="Module State"
            value={clusterMetrics?.consensusModuleState || '\u2014'}
            alert={clusterMetrics?.consensusModuleState === 'SUSPENDED'}
            tooltip="Consensus module state: ACTIVE is normal, SUSPENDED means log processing is paused"
          />
          <SummaryCard
            label="Commit Position"
            value={clusterMetrics?.commitPosition?.toLocaleString() ?? '\u2014'}
            tooltip="Position up to which the cluster log has been committed and replicated to a majority of nodes"
          />
          <SummaryCard
            label="Election State"
            value={clusterMetrics?.electionState === '17' ? 'CLOSED' : clusterMetrics?.electionState ?? '\u2014'}
            tooltip="Current election state. CLOSED (17) means no election in progress and the cluster is operating normally"
          />
          <SummaryCard
            label="Leadership Term"
            value={String(clusterMetrics?.leaderMemberId ?? '\u2014')}
            tooltip="Current leadership term ID. Increments each time a new leader is elected"
          />
          <SummaryCard
            label="Recordings"
            value={String(metrics.recordingCount ?? 0)}
            tooltip="Number of archive recordings on this node"
          />
          <SummaryCard
            label="Errors"
            value={String(errors)}
            alert={errors > 0}
            tooltip="Lifetime cluster + container errors (resets on process restart). Non-zero indicates issues that may need investigation"
          />
          <SummaryCard
            label="Snapshots"
            value={String(snapshots)}
            tooltip="Number of snapshots taken by the consensus module for log compaction and recovery"
          />
          <SummaryCard
            label="Elections"
            value={String(electionCount)}
            tooltip="Total number of leader elections since the node started. Frequent elections may indicate instability"
          />
          <SummaryCard
            label="Max Cycle Time"
            value={formatNsAsMs(maxCycleNs)}
            tooltip="Worst-case duty cycle time of the consensus module. High values indicate processing delays or GC pauses"
          />
          <SummaryCard
            label="Traffic"
            value={`\u2191${formatBytes(sentPerSec)}/s \u2193${formatBytes(recvPerSec)}/s`}
            tooltip="Current network throughput (bytes/sec) of the Aeron media driver on this node"
          />
          {metrics.systemMetrics && metrics.systemMetrics.archiveDiskTotalBytes > 0 && (
            <DiskDonut
              label="Archive Disk"
              recordings={metrics.recordingsTotalBytes ?? 0}
              used={metrics.systemMetrics.archiveDiskUsedBytes}
              total={metrics.systemMetrics.archiveDiskTotalBytes}
              growth={metrics.diskGrowth}
              compact
              className="w-full lg:col-span-2"
            />
          )}
          {metrics.systemMetrics && metrics.systemMetrics.shmDiskTotalBytes > 0 && (
            <DiskDonut
              label="SHM"
              recordings={0}
              used={metrics.systemMetrics.shmDiskUsedBytes}
              total={metrics.systemMetrics.shmDiskTotalBytes}
              compact
              className="w-full lg:col-span-2"
            />
          )}
        </>)}
      </div>

      {/* Node Actions */}
      {!isBackup && (
        <div className="rounded-lg border border-border-subtle bg-surface p-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* Admin Actions */}
            <span className="text-xs font-medium text-text-muted">Admin</span>
            <div className="flex flex-wrap gap-1.5">
              {actions.map((action) => (
                <button
                  key={action.id}
                  onClick={() => setConfirmAction({ label: action.label, description: action.description, fn: () => executeAction(action.id, action.endpoint) })}
                  disabled={loading !== null}
                  title={action.tooltip}
                  className="rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-critical-fill/40 text-critical-text hover:bg-critical-surface"
                >
                  {loading === action.id ? '...' : action.label}
                </button>
              ))}
            </div>

            <span className="hidden lg:block w-px h-5 bg-border-subtle" />

            {/* Diagnostics */}
            <span className="text-xs font-medium text-text-muted">Diagnostics</span>
            <div className="flex flex-wrap gap-1.5">
              {diagnostics.map((diag) => (
                <button
                  key={diag.id}
                  onClick={() => executeAction(diag.id, diag.endpoint, 'GET')}
                  disabled={loading !== null}
                  title={diag.tooltip}
                  className="rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-border-medium text-text-primary hover:bg-elevated"
                >
                  {loading === diag.id ? '...' : diag.label}
                </button>
              ))}
            </div>

            {isLeader && (<>
              <span className="hidden lg:block w-px h-5 bg-border-subtle" />

              {/* Egress Recording */}
              {metrics.egressRecording?.active ? (
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-2 w-2 rounded-full bg-critical-text animate-pulse" />
                  <span className="text-xs text-text-secondary">
                    Stream {metrics.egressRecording.streamId}
                    {' \u2022 '}{new Date(metrics.egressRecording.startTimeMs).toLocaleTimeString()}
                    {metrics.egressRecording.durationLimitSeconds > 0 &&
                      ` \u2022 ${metrics.egressRecording.durationLimitSeconds}s limit`}
                  </span>
                  <button
                    onClick={() => executeAction('Stop Recording', 'egress-recording/stop')}
                    disabled={loading !== null}
                    className="rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-critical-surface text-critical-text hover:bg-critical-fill/30"
                  >
                    {loading === 'Stop Recording' ? '...' : 'Stop Recording'}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-text-muted">Stream</label>
                  <input
                    type="number"
                    value={recordingStreamId}
                    onChange={(e) => setRecordingStreamId(e.target.value)}
                    className="w-14 rounded border border-border-medium bg-elevated px-2 py-1 text-xs text-text-primary"
                  />
                  <label className="text-xs text-text-muted">Duration</label>
                  <input
                    type="number"
                    value={recordingDuration}
                    onChange={(e) => setRecordingDuration(e.target.value)}
                    className="w-14 rounded border border-border-medium bg-elevated px-2 py-1 text-xs text-text-primary"
                    placeholder="0"
                  />
                  <button
                    onClick={() => executeAction(
                      'Start Recording',
                      `egress-recording/start?streamId=${recordingStreamId}&durationSeconds=${recordingDuration}`
                    )}
                    disabled={loading !== null}
                    className="rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-border-medium text-text-primary hover:bg-elevated"
                  >
                    {loading === 'Start Recording' ? '...' : 'Record Spy'}
                  </button>
                </div>
              )}
            </>)}
          </div>
        </div>
      )}
      {actionResult?.output && (
        <pre className="rounded-md bg-canvas border border-border-subtle px-4 py-3 text-xs font-mono text-text-secondary overflow-x-auto whitespace-pre-wrap">
          {actionResult.output}
        </pre>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction?.label ?? ''}
        description={confirmAction?.description}
        destructive
        onConfirm={() => { confirmAction?.fn(); setConfirmAction(null) }}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Counters Table */}
      <div>
        <h3 className="text-sm font-medium text-text-muted mb-3">
          Aeron Counters ({counters?.length ?? 0})
        </h3>
        <CounterTable counters={counters ?? []} />
      </div>
    </div>
  )
}

function SummaryCard({ label, value, alert, tooltip }: { label: string; value: string; alert?: boolean; tooltip?: string }) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${alert ? 'border-critical-fill/40 bg-critical-surface' : 'border-border-subtle bg-surface'} ${tooltip ? 'cursor-help' : ''}`}
      title={tooltip}
    >
      <div className="text-xs text-text-muted mb-0.5">{label}</div>
      <div className={`text-sm font-mono truncate ${alert ? 'text-critical-text' : 'text-text-primary'}`}>{value}</div>
    </div>
  )
}

