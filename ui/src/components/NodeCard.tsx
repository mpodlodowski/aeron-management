import { Link } from 'react-router-dom'
import { MetricsReport } from '../types'

interface Props {
  metrics: MetricsReport
  isLeader: boolean
}

export default function NodeCard({ metrics, isLeader }: Props) {
  const { clusterMetrics, systemMetrics } = metrics
  const role = clusterMetrics?.nodeRole ?? 'UNKNOWN'

  const statusColor =
    role === 'LEADER' ? 'bg-green-500' :
    role === 'FOLLOWER' ? 'bg-blue-500' :
    role === 'CANDIDATE' ? 'bg-yellow-500' : 'bg-red-500'

  const heapPercent = systemMetrics
    ? Math.round((systemMetrics.heapUsedBytes / systemMetrics.heapMaxBytes) * 100)
    : 0

  return (
    <Link
      to={`/nodes/${metrics.nodeId}`}
      className="block rounded-lg border border-gray-800 bg-gray-900 p-5 hover:border-gray-600 transition-colors"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-lg font-medium">Node {metrics.nodeId}</span>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor} text-white`}>
          {isLeader ? 'LEADER' : role}
        </span>
      </div>
      <div className="space-y-2 text-sm text-gray-400">
        <div className="flex justify-between">
          <span>Commit Position</span>
          <span className="text-gray-200 font-mono">{clusterMetrics?.commitPosition?.toLocaleString() ?? '\u2014'}</span>
        </div>
        <div className="flex justify-between">
          <span>Clients</span>
          <span className="text-gray-200">{clusterMetrics?.connectedClientCount ?? 0}</span>
        </div>
        <div className="flex justify-between">
          <span>Heap</span>
          <span className="text-gray-200">{heapPercent}%</span>
        </div>
      </div>
    </Link>
  )
}
