import { Link } from 'react-router-dom'
import { MetricsReport } from '../types'
import { totalErrors, counterByType, formatBytes, formatDuration, backupStateName, COUNTER_TYPE } from '../utils/counters'

interface Props {
  metrics: MetricsReport
  isLeader: boolean
  clusterId: string
}

export default function NodeCard({ metrics, isLeader, clusterId }: Props) {
  const { clusterMetrics, counters, systemMetrics } = metrics
  const isBackup = metrics.agentMode === 'backup'
  const role = isBackup ? 'BACKUP' : (clusterMetrics?.nodeRole ?? 'UNKNOWN')
  const agentDown = metrics.agentConnected === false
  const noCnc = !agentDown && metrics.cncAccessible === false
  const nodeDown = !agentDown && !noCnc && metrics.nodeReachable === false
  const c = counters ?? []

  const errors = totalErrors(c)
  const sentPerSec = metrics.bytesSentPerSec ?? 0
  const recvPerSec = metrics.bytesRecvPerSec ?? 0
  const diskPct = systemMetrics && systemMetrics.archiveDiskTotalBytes > 0
    ? Math.round((systemMetrics.archiveDiskUsedBytes / systemMetrics.archiveDiskTotalBytes) * 100)
    : -1
  const diskColor = diskPct > 90 ? 'text-red-400 font-medium' : diskPct > 75 ? 'text-yellow-400 font-medium' : 'text-gray-200'
  const ttf = metrics.diskGrowth?.timeToFullSeconds ?? null

  const statusColor = agentDown ? 'bg-gray-500' :
    noCnc ? 'bg-yellow-500' :
    nodeDown ? 'bg-red-500' :
    isBackup ? 'bg-purple-500' :
    role === 'LEADER' ? 'bg-green-500' :
    role === 'FOLLOWER' ? 'bg-blue-500' :
    role === 'CANDIDATE' ? 'bg-yellow-500' : 'bg-red-500'

  const borderClass = agentDown
    ? 'border-gray-800/50 bg-gray-900/60 opacity-75 hover:border-gray-700'
    : noCnc
    ? 'border-yellow-800 bg-yellow-900/20 hover:border-yellow-600'
    : nodeDown
    ? 'border-red-800 bg-red-900/20 hover:border-red-600'
    : 'border-gray-800 bg-gray-900 hover:border-gray-600'

  const statusLabel = agentDown ? 'agent down' : noCnc ? 'no connectivity' : nodeDown ? 'node down' : null

  return (
    <Link
      to={`/clusters/${clusterId}/nodes/${metrics.nodeId}`}
      className={`block rounded-lg border p-5 transition-colors ${borderClass}`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-lg font-medium">
          {isBackup ? 'Backup' : `Node ${metrics.nodeId}`}
          {statusLabel && (
            <span className={`ml-2 text-xs font-normal ${nodeDown ? 'text-red-400' : noCnc ? 'text-yellow-400' : 'text-gray-500'}`}>
              {statusLabel}
            </span>
          )}
          {!statusLabel && isBackup && (
            <span className="ml-2 text-xs font-normal text-purple-400">
              {backupStateName(counterByType(c, COUNTER_TYPE.BACKUP_STATE)?.value ?? -1)}
            </span>
          )}
          {!statusLabel && !isBackup && clusterMetrics?.electionState && clusterMetrics.electionState !== '17' && (
            <span className="ml-2 text-xs font-normal text-yellow-400">
              electing
            </span>
          )}
        </span>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor} text-white`}>
          {agentDown ? 'OFFLINE' : noCnc ? 'DETACHED' : nodeDown ? 'DOWN' : isLeader ? 'LEADER' : role}
        </span>
      </div>
      <div className="space-y-2 text-sm text-gray-400">
        {isBackup ? (<>
          <div className="flex justify-between">
            <span>Live Log Position</span>
            <span className="text-gray-200 font-mono">{(counterByType(c, COUNTER_TYPE.BACKUP_LIVE_LOG_POSITION)?.value ?? 0).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>Recordings</span>
            <span className="text-gray-200">{metrics.recordingCount ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span>Errors</span>
            <span className={(counterByType(c, COUNTER_TYPE.BACKUP_ERRORS)?.value ?? 0) > 0 ? 'text-red-400 font-medium' : 'text-gray-200'}>
              {counterByType(c, COUNTER_TYPE.BACKUP_ERRORS)?.value ?? 0}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Traffic</span>
            <span className="text-gray-200 font-mono text-xs">&uarr;{formatBytes(sentPerSec)}/s &darr;{formatBytes(recvPerSec)}/s</span>
          </div>
          {diskPct >= 0 && (
            <div className="flex justify-between">
              <span>Archive Disk</span>
              <span className="flex items-center gap-2">
                {ttf !== null && (
                  <span className={`text-xs ${ttf < 3600 ? 'text-red-400' : ttf < 86400 ? 'text-yellow-400' : 'text-gray-500'}`}>
                    full in {formatDuration(ttf)}
                  </span>
                )}
                <span className={`${diskColor} font-mono text-xs`}>{formatBytes(systemMetrics.archiveDiskUsedBytes)} / {formatBytes(systemMetrics.archiveDiskTotalBytes)}</span>
              </span>
            </div>
          )}
        </>) : (<>
          <div className="flex justify-between">
            <span>Commit Position</span>
            <span className="text-gray-200 font-mono">{clusterMetrics?.commitPosition?.toLocaleString() ?? '\u2014'}</span>
          </div>
          <div className="flex justify-between">
            <span>Recordings</span>
            <span className="text-gray-200">{metrics.recordingCount ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span>Errors</span>
            <span className={errors > 0 ? 'text-red-400 font-medium' : 'text-gray-200'}>{errors}</span>
          </div>
          <div className="flex justify-between">
            <span>Traffic</span>
            <span className="text-gray-200 font-mono text-xs">&uarr;{formatBytes(sentPerSec)}/s &darr;{formatBytes(recvPerSec)}/s</span>
          </div>
          {diskPct >= 0 && (
            <div className="flex justify-between">
              <span>Archive Disk</span>
              <span className="flex items-center gap-2">
                {ttf !== null && (
                  <span className={`text-xs ${ttf < 3600 ? 'text-red-400' : ttf < 86400 ? 'text-yellow-400' : 'text-gray-500'}`}>
                    full in {formatDuration(ttf)}
                  </span>
                )}
                <span className={`${diskColor} font-mono text-xs`}>{formatBytes(systemMetrics.archiveDiskUsedBytes)} / {formatBytes(systemMetrics.archiveDiskTotalBytes)}</span>
              </span>
            </div>
          )}
        </>)}
      </div>
    </Link>
  )
}
