import { Link } from 'react-router-dom'
import { MetricsReport } from '../types'
import { totalErrors, counterByType, counterByLabel, formatBytes, backupStateName, COUNTER_TYPE } from '../utils/counters'

interface Props {
  metrics: MetricsReport
  isLeader: boolean
}

export default function NodeCard({ metrics, isLeader }: Props) {
  const { clusterMetrics, counters } = metrics
  const isBackup = metrics.agentMode === 'backup'
  const role = isBackup ? 'BACKUP' : (clusterMetrics?.nodeRole ?? 'UNKNOWN')
  const agentDown = metrics.agentConnected === false
  const nodeDown = !agentDown && metrics.nodeReachable === false
  const c = counters ?? []

  const errors = totalErrors(c)
  const bytesSent = counterByLabel(c, 'Bytes sent')?.value ?? 0
  const bytesRecv = counterByLabel(c, 'Bytes received')?.value ?? 0

  const statusColor = agentDown ? 'bg-gray-500' :
    nodeDown ? 'bg-red-500' :
    isBackup ? 'bg-purple-500' :
    role === 'LEADER' ? 'bg-green-500' :
    role === 'FOLLOWER' ? 'bg-blue-500' :
    role === 'CANDIDATE' ? 'bg-yellow-500' : 'bg-red-500'

  const borderClass = agentDown
    ? 'border-yellow-800/50 bg-gray-900/60 opacity-75 hover:border-yellow-700'
    : nodeDown
    ? 'border-red-800 bg-red-900/20 hover:border-red-600'
    : 'border-gray-800 bg-gray-900 hover:border-gray-600'

  const statusLabel = agentDown ? 'agent down' : nodeDown ? 'node down' : null

  return (
    <Link
      to={`/nodes/${metrics.nodeId}`}
      className={`block rounded-lg border p-5 transition-colors ${borderClass}`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-lg font-medium">
          {isBackup ? 'Backup' : `Node ${metrics.nodeId}`}
          {statusLabel && (
            <span className={`ml-2 text-xs font-normal ${nodeDown ? 'text-red-400' : 'text-yellow-500'}`}>
              {statusLabel}
            </span>
          )}
        </span>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor} text-white`}>
          {agentDown ? 'OFFLINE' : nodeDown ? 'DOWN' : isLeader ? 'LEADER' : role}
        </span>
      </div>
      <div className="space-y-2 text-sm text-gray-400">
        {isBackup ? (<>
          <div className="flex justify-between">
            <span>Backup State</span>
            <span className="text-gray-200">{backupStateName(counterByType(c, COUNTER_TYPE.BACKUP_STATE)?.value ?? -1)}</span>
          </div>
          <div className="flex justify-between">
            <span>Live Log Position</span>
            <span className="text-gray-200 font-mono">{(counterByType(c, COUNTER_TYPE.BACKUP_LIVE_LOG_POSITION)?.value ?? 0).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>Recordings</span>
            <span className="text-gray-200">{metrics.recordings?.length ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span>Errors</span>
            <span className={(counterByType(c, COUNTER_TYPE.BACKUP_ERRORS)?.value ?? 0) > 0 ? 'text-red-400 font-medium' : 'text-gray-200'}>
              {counterByType(c, COUNTER_TYPE.BACKUP_ERRORS)?.value ?? 0}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Traffic</span>
            <span className="text-gray-200 font-mono text-xs">&uarr;{formatBytes(bytesSent)} &darr;{formatBytes(bytesRecv)}</span>
          </div>
        </>) : (<>
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
            <span className="text-gray-200">{counterByType(c, COUNTER_TYPE.SNAPSHOT_COUNT)?.value ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span>Traffic</span>
            <span className="text-gray-200 font-mono text-xs">&uarr;{formatBytes(bytesSent)} &darr;{formatBytes(bytesRecv)}</span>
          </div>
        </>)}
      </div>
    </Link>
  )
}
