import { useEffect } from 'react'
import { useClusterStore } from '../stores/clusterStore'
import { useWebSocket } from '../hooks/useWebSocket'
import NodeCard from '../components/NodeCard'
import EventLog from '../components/EventLog'
import { Alert, ClusterOverview } from '../types'
import { formatUptime, formatNsAsMs } from '../utils/counters'

export default function Dashboard() {
  useWebSocket()
  const { nodes, leaderNodeId, clusterStats, alerts, updateCluster, setAlerts } = useClusterStore()

  useEffect(() => {
    fetch('/api/cluster')
      .then((res) => res.json())
      .then((data: ClusterOverview) => updateCluster(data))
      .catch((err) => console.error('Failed to fetch cluster state:', err))

    fetch('/api/cluster/events')
      .then((res) => res.json())
      .then((data: Alert[]) => setAlerts(data))
      .catch((err) => console.error('Failed to fetch events:', err))
  }, [updateCluster, setAlerts])

  const sortedNodes = Array.from(nodes.values()).sort((a, b) => {
    const aIsBackup = a.agentMode === 'backup' ? 1 : 0
    const bIsBackup = b.agentMode === 'backup' ? 1 : 0
    if (aIsBackup !== bIsBackup) return aIsBackup - bIsBackup
    return a.nodeId - b.nodeId
  })

  const cs = clusterStats
  const uptime = cs?.clusterStartMs ? Date.now() - cs.clusterStartMs : null

  return (
    <div className="space-y-6">
      {/* Cluster Overview */}
      {cs && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-300">Cluster Overview</h2>
            {cs.aeronVersion && (
              <span className="text-xs text-gray-500">Aeron {cs.aeronVersion}</span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {uptime !== null && (
              <StatCard label="Uptime" value={formatUptime(uptime)} tooltip="Time since the earliest log recording was created (cluster creation)" />
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
