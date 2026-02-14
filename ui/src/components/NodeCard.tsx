import { Link } from 'react-router-dom'
import { MetricsReport } from '../types'
import { totalErrors, counterByType, counterByLabel, formatBytes, COUNTER_TYPE } from '../utils/counters'

interface Props {
  metrics: MetricsReport
  isLeader: boolean
}

export default function NodeCard({ metrics, isLeader }: Props) {
  const { clusterMetrics, counters } = metrics
  const role = clusterMetrics?.nodeRole ?? 'UNKNOWN'
  const disconnected = metrics.agentConnected === false
  const c = counters ?? []

  const errors = totalErrors(c)
  const snapshots = counterByType(c, COUNTER_TYPE.SNAPSHOT_COUNT)?.value ?? 0
  const bytesSent = counterByLabel(c, 'Bytes sent')?.value ?? 0
  const bytesRecv = counterByLabel(c, 'Bytes received')?.value ?? 0

  const statusColor = disconnected ? 'bg-gray-500' :
    role === 'LEADER' ? 'bg-green-500' :
    role === 'FOLLOWER' ? 'bg-blue-500' :
    role === 'CANDIDATE' ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <Link
      to={`/nodes/${metrics.nodeId}`}
      className={`block rounded-lg border p-5 transition-colors ${
        disconnected
          ? 'border-yellow-800/50 bg-gray-900/60 opacity-75 hover:border-yellow-700'
          : 'border-gray-800 bg-gray-900 hover:border-gray-600'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-lg font-medium">
          Node {metrics.nodeId}
          {disconnected && <span className="ml-2 text-xs text-yellow-500 font-normal">disconnected</span>}
        </span>
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
          <span>Errors</span>
          <span className={errors > 0 ? 'text-red-400 font-medium' : 'text-gray-200'}>{errors}</span>
        </div>
        <div className="flex justify-between">
          <span>Snapshots</span>
          <span className="text-gray-200">{snapshots}</span>
        </div>
        <div className="flex justify-between">
          <span>Traffic</span>
          <span className="text-gray-200 font-mono text-xs">&uarr;{formatBytes(bytesSent)} &darr;{formatBytes(bytesRecv)}</span>
        </div>
      </div>
    </Link>
  )
}
