import { Link } from 'react-router-dom'
import { MetricsReport } from '../types'
import { totalErrors, counterByType, formatBytes, formatDuration, backupStateName, COUNTER_TYPE } from '../utils/counters'
import { roleDotColor, nodeBorderClass, diskUsageColor, ttfColor } from '../utils/statusColors'

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
  const diskColor = diskUsageColor(diskPct)
  const ttf = metrics.diskGrowth?.timeToFullSeconds ?? null

  const displayRole = agentDown ? 'OFFLINE' : noCnc ? 'DETACHED' : nodeDown ? 'DOWN' : isBackup ? 'BACKUP' : role
  const dotColor = roleDotColor(displayRole)

  const borderClass = nodeBorderClass(agentDown, noCnc, nodeDown)

  const statusLabel = agentDown ? 'agent down' : noCnc ? 'no connectivity' : nodeDown ? 'node down' : null

  return (
    <Link
      to={`/clusters/${clusterId}/nodes/${metrics.nodeId}`}
      className={`block rounded-lg border p-5 transition-colors ${borderClass}${isLeader && !agentDown && !noCnc && !nodeDown ? ' border-l-2 border-l-success-text' : ''}`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-lg font-medium">
          {isBackup ? 'Backup' : `Node ${metrics.nodeId}`}
          {statusLabel && (
            <span className={`ml-2 text-xs font-normal ${nodeDown ? 'text-critical-text' : noCnc ? 'text-warning-text' : 'text-text-muted'}`}>
              {statusLabel}
            </span>
          )}
          {!statusLabel && isBackup && (
            <span className="ml-2 text-xs font-normal text-role-backup">
              {backupStateName(counterByType(c, COUNTER_TYPE.BACKUP_STATE)?.value ?? -1)}
            </span>
          )}
          {!statusLabel && !isBackup && clusterMetrics?.electionState && clusterMetrics.electionState !== '17' && (
            <span className="ml-2 text-xs font-normal text-warning-text">
              electing
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          {metrics.egressRecording?.active && (
            <span className="inline-flex items-center gap-1 text-xs text-role-backup" title="Spy recording active">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-role-backup animate-pulse" />
              REC
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
            <span className={`inline-block h-2 w-2 rounded-full ${dotColor}`} />
            {agentDown ? 'OFFLINE' : noCnc ? 'DETACHED' : nodeDown ? 'DOWN' : isLeader ? 'LEADER' : role}
          </span>
        </span>
      </div>
      <div className="space-y-2 text-sm text-text-secondary">
        {isBackup ? (<>
          <div className="flex justify-between">
            <span>Live Log Position</span>
            <span className="text-text-primary font-mono">{(counterByType(c, COUNTER_TYPE.BACKUP_LIVE_LOG_POSITION)?.value ?? 0).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>Recordings</span>
            <span className="text-text-primary">{metrics.recordingCount ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span>Errors</span>
            <span className={(counterByType(c, COUNTER_TYPE.BACKUP_ERRORS)?.value ?? 0) > 0 ? 'text-critical-text font-medium' : 'text-text-primary'}>
              {counterByType(c, COUNTER_TYPE.BACKUP_ERRORS)?.value ?? 0}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Traffic</span>
            <span className="text-text-primary font-mono text-xs">&uarr;{formatBytes(sentPerSec)}/s &darr;{formatBytes(recvPerSec)}/s</span>
          </div>
          {diskPct >= 0 && (
            <div className="flex justify-between">
              <span>Archive Disk</span>
              <span className="flex items-center gap-2">
                {ttf !== null && (
                  <span className={`text-xs ${ttfColor(ttf)}`}>
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
            <span className="text-text-primary font-mono">{clusterMetrics?.commitPosition?.toLocaleString() ?? '\u2014'}</span>
          </div>
          <div className="flex justify-between">
            <span>Recordings</span>
            <span className="text-text-primary">{metrics.recordingCount ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span>Errors</span>
            <span className={errors > 0 ? 'text-critical-text font-medium' : 'text-text-primary'}>{errors}</span>
          </div>
          <div className="flex justify-between">
            <span>Traffic</span>
            <span className="text-text-primary font-mono text-xs">&uarr;{formatBytes(sentPerSec)}/s &darr;{formatBytes(recvPerSec)}/s</span>
          </div>
          {diskPct >= 0 && (
            <div className="flex justify-between">
              <span>Archive Disk</span>
              <span className="flex items-center gap-2">
                {ttf !== null && (
                  <span className={`text-xs ${ttfColor(ttf)}`}>
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
