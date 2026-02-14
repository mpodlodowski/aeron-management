import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useClusterStore } from '../stores/clusterStore'
import { useWebSocket } from '../hooks/useWebSocket'
import NodeCard from '../components/NodeCard'
import EventLog from '../components/EventLog'
import { Alert, ClusterOverview } from '../types'

export default function Dashboard() {
  useWebSocket()
  const { nodes, leaderNodeId, alerts, connected, updateCluster, setAlerts } = useClusterStore()

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-semibold">Cluster Dashboard</h2>
          <Link
            to="/archive"
            className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            Archive Recordings
          </Link>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              connected ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="text-gray-400">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

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
