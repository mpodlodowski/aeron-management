import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useClusterStore } from '../stores/clusterStore'
import { useWebSocket } from '../hooks/useWebSocket'
import CounterTable from '../components/CounterTable'
import { MetricsReport } from '../types'
import { totalErrors, counterByType, counterByLabel, formatBytes, formatNsAsMs, backupStateName, COUNTER_TYPE } from '../utils/counters'

interface ActionResult {
  action: string
  success: boolean
  message: string
  output?: string
}

export default function NodeDetail() {
  useWebSocket()
  const { nodeId } = useParams<{ nodeId: string }>()
  const id = Number(nodeId)
  const nodes = useClusterStore((s) => s.nodes)
  const updateNode = useClusterStore((s) => s.updateNode)
  const metrics = nodes.get(id)
  const isBackup = metrics?.agentMode === 'backup'
  const [actionResult, setActionResult] = useState<ActionResult | null>(null)
  const [loading, setLoading] = useState<string | null>(null)

  useEffect(() => {
    if (!metrics) {
      fetch(`/api/nodes/${id}`)
        .then((res) => res.ok ? res.json() : null)
        .then((data: MetricsReport | null) => {
          if (data) updateNode(data)
        })
        .catch(() => {})
    }
  }, [id, metrics, updateNode])

  async function executeAction(action: string, endpoint: string, method: 'POST' | 'GET' = 'POST') {
    setLoading(action)
    setActionResult(null)
    try {
      const res = await fetch(`/api/nodes/${id}/${endpoint}`, { method })
      const data = await res.json()
      setActionResult({
        action,
        success: res.ok,
        message: data.message ?? (res.ok ? 'Action completed' : 'Action failed'),
        output: data.output,
      })
    } catch (err) {
      setActionResult({
        action,
        success: false,
        message: err instanceof Error ? err.message : 'Network error',
      })
    } finally {
      setLoading(null)
    }
  }

  if (!metrics) {
    return (
      <div className="text-gray-500">
        No data available for Node {id}. Waiting for metrics...
      </div>
    )
  }

  const { clusterMetrics, counters } = metrics
  const c = counters ?? []
  const errors = totalErrors(c)
  const snapshots = counterByType(c, COUNTER_TYPE.SNAPSHOT_COUNT)?.value ?? 0
  const electionCount = counterByType(c, COUNTER_TYPE.ELECTION_COUNT)?.value ?? 0
  const maxCycleNs = counterByType(c, COUNTER_TYPE.MAX_CYCLE_TIME_NS)?.value ?? 0
  const bytesSent = counterByLabel(c, 'Bytes sent')?.value ?? 0
  const bytesRecv = counterByLabel(c, 'Bytes received')?.value ?? 0
  const bytesMapped = counterByLabel(c, 'Bytes currently mapped')?.value ?? 0
  const naksRecv = counterByLabel(c, 'NAKs received')?.value ?? 0

  const isLeader = clusterMetrics?.nodeRole === 'LEADER'
  const actions = [
    { id: 'SNAPSHOT', label: 'Snapshot', endpoint: 'snapshot', color: 'bg-blue-600 hover:bg-blue-500', leaderOnly: true },
    { id: 'SUSPEND', label: 'Suspend', endpoint: 'suspend', color: 'bg-yellow-600 hover:bg-yellow-500', leaderOnly: true },
    { id: 'RESUME', label: 'Resume', endpoint: 'resume', color: 'bg-green-600 hover:bg-green-500', leaderOnly: true },
    { id: 'SHUTDOWN', label: 'Shutdown', endpoint: 'shutdown', color: 'bg-red-600 hover:bg-red-500', leaderOnly: true },
    { id: 'ABORT', label: 'Abort', endpoint: 'abort', color: 'bg-red-700 hover:bg-red-600', leaderOnly: true },
    { id: 'INVALIDATE_SNAPSHOT', label: 'Invalidate Snapshot', endpoint: 'invalidate-snapshot', color: 'bg-orange-600 hover:bg-orange-500', leaderOnly: false },
  ].filter(a => !a.leaderOnly || isLeader)

  const diagnostics = [
    { id: 'DESCRIBE', label: 'Describe', endpoint: 'describe' },
    { id: 'PID', label: 'PID', endpoint: 'pid' },
    { id: 'RECOVERY_PLAN', label: 'Recovery Plan', endpoint: 'recovery-plan' },
    { id: 'RECORDING_LOG', label: 'Recording Log', endpoint: 'recording-log' },
    { id: 'ERRORS', label: 'Errors', endpoint: 'errors' },
    { id: 'LIST_MEMBERS', label: 'List Members', endpoint: 'list-members' },
    { id: 'IS_LEADER', label: 'Is Leader', endpoint: 'is-leader' },
    { id: 'DESCRIBE_SNAPSHOT', label: 'Describe Snapshot', endpoint: 'describe-snapshot' },
  ]

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
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
            value={String(metrics.recordings?.length ?? 0)}
            tooltip="Number of archive recordings on the backup node"
          />
          <SummaryCard
            label="Bytes Sent"
            value={formatBytes(bytesSent)}
            tooltip="Total bytes sent by the Aeron media driver on this node"
          />
          <SummaryCard
            label="Bytes Received"
            value={formatBytes(bytesRecv)}
            tooltip="Total bytes received by the Aeron media driver on this node"
          />
          <SummaryCard
            label="Mapped Memory"
            value={formatBytes(bytesMapped)}
            tooltip="Total bytes of memory-mapped files used by the Aeron media driver (log buffers, CnC, etc.)"
          />
        </>) : (<>
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
            label="Errors"
            value={String(errors)}
            alert={errors > 0}
            tooltip="Total cluster + container errors. Non-zero indicates issues that may need investigation"
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
            label="NAKs Received"
            value={String(naksRecv)}
            alert={naksRecv > 0}
            tooltip="Negative acknowledgements received, indicating packet loss requiring retransmission"
          />
          <SummaryCard
            label="Bytes Sent"
            value={formatBytes(bytesSent)}
            tooltip="Total bytes sent by the Aeron media driver on this node"
          />
          <SummaryCard
            label="Bytes Received"
            value={formatBytes(bytesRecv)}
            tooltip="Total bytes received by the Aeron media driver on this node"
          />
          <SummaryCard
            label="Mapped Memory"
            value={formatBytes(bytesMapped)}
            tooltip="Total bytes of memory-mapped files used by the Aeron media driver (log buffers, CnC, etc.)"
          />
          <SummaryCard
            label="Clients"
            value={String(clusterMetrics?.connectedClientCount ?? 0)}
            tooltip="Number of client sessions currently connected to this cluster node"
          />
        </>)}
      </div>

      {/* Admin Actions & Diagnostics */}
      {!isBackup && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <h3 className="text-xs font-medium text-gray-400 mb-2">Admin Actions</h3>
            <div className="flex flex-wrap gap-1.5">
              {actions.map((action) => (
                <button
                  key={action.id}
                  onClick={() => executeAction(action.id, action.endpoint)}
                  disabled={loading !== null}
                  className={`rounded px-2.5 py-1 text-xs font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${action.color}`}
                >
                  {loading === action.id ? '...' : action.label}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <h3 className="text-xs font-medium text-gray-400 mb-2">Diagnostics</h3>
            <div className="flex flex-wrap gap-1.5">
              {diagnostics.map((diag) => (
                <button
                  key={diag.id}
                  onClick={() => executeAction(diag.id, diag.endpoint, 'GET')}
                  disabled={loading !== null}
                  className="rounded px-2.5 py-1 text-xs font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-gray-600 hover:bg-gray-500"
                >
                  {loading === diag.id ? '...' : diag.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {actionResult && (
        <div className="space-y-2">
          <div
            className={`rounded-md px-4 py-2 text-sm ${
              actionResult.success
                ? 'bg-green-900/50 text-green-300 border border-green-800'
                : 'bg-red-900/50 text-red-300 border border-red-800'
            }`}
          >
            <span className="font-medium">{actionResult.action}:</span>{' '}
            {actionResult.message}
          </div>
          {actionResult.output && (
            <pre className="rounded-md bg-black/80 border border-gray-700 px-4 py-3 text-xs font-mono text-gray-300 overflow-x-auto whitespace-pre-wrap">
              {actionResult.output}
            </pre>
          )}
        </div>
      )}

      {/* Counters Table */}
      <div>
        <h3 className="text-sm font-medium text-gray-400 mb-3">
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
      className={`rounded-lg border px-3 py-2 ${alert ? 'border-red-800 bg-red-900/20' : 'border-gray-800 bg-gray-900'} ${tooltip ? 'cursor-help' : ''}`}
      title={tooltip}
    >
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <div className={`text-sm font-mono truncate ${alert ? 'text-red-400' : 'text-gray-200'}`}>{value}</div>
    </div>
  )
}
