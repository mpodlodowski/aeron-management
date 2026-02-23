import { useMatch } from 'react-router-dom'
import { useClusterStore } from '../stores/clusterStore'

export function StatusBanner() {
  const match = useMatch('/clusters/:clusterId/*')
  const clusterId = match?.params.clusterId
  const cluster = useClusterStore((s) => s.clusters.get(clusterId ?? ''))

  if (!cluster) return null

  const clusterState = cluster.clusterState
  const nodes = cluster.nodes

  // Compute down nodes
  const downNodes: number[] = []
  for (const [nodeId, metrics] of nodes) {
    if (metrics.agentConnected !== false && metrics.cncAccessible !== false && metrics.nodeReachable === false) {
      downNodes.push(nodeId)
    }
  }
  downNodes.sort((a, b) => a - b)

  if (clusterState === 'SUSPENDED') {
    return (
      <div className="border-l-4 border-warning-fill bg-warning-surface px-6 py-2.5 flex items-center gap-3">
        <span className="text-sm text-warning-text font-medium">Cluster is suspended</span>
        <span className="text-sm text-text-secondary">Log processing is paused.</span>
      </div>
    )
  }

  if (clusterState === 'SNAPSHOT') {
    return (
      <div className="border-l-4 border-info-fill bg-info-surface px-6 py-2.5 flex items-center gap-3">
        <span className="text-sm text-info-text font-medium">Snapshot in progress</span>
        <span className="text-sm text-text-secondary">Cluster is taking a snapshot for log compaction.</span>
      </div>
    )
  }

  if (downNodes.length > 0) {
    const label = downNodes.length === 1
      ? `Node ${downNodes[0]} is unreachable`
      : `${downNodes.length} nodes are unreachable (${downNodes.join(', ')})`
    return (
      <div className="border-l-4 border-critical-fill bg-critical-surface px-6 py-2.5 flex items-center gap-3">
        <span className="text-sm text-critical-text font-medium">{label}</span>
      </div>
    )
  }

  return null
}
