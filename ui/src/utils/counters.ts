import { AeronCounter } from '../types'

// Aeron cluster counter type IDs (verified against 1.46.5)
export const COUNTER_TYPE = {
  CLUSTER_ERRORS: 212,
  CONTAINER_ERRORS: 215,
  SNAPSHOT_COUNT: 205,
  ELECTION_COUNT: 238,
  MAX_CYCLE_TIME_NS: 216,
  BACKUP_STATE: 208,
  BACKUP_LIVE_LOG_POSITION: 209,
  BACKUP_NEXT_QUERY_DEADLINE_MS: 210,
  BACKUP_ERRORS: 211,
} as const

const BACKUP_STATE_NAMES: Record<number, string> = {
  0: 'init',
  1: 'backup query',
  2: 'snapshot retrieve',
  3: 'live log replay',
  4: 'update recording log',
  5: 'backing up',
  6: 'reset backup',
}

export function backupStateName(value: number): string {
  return BACKUP_STATE_NAMES[value] ?? `UNKNOWN(${value})`
}

export function counterByType(counters: AeronCounter[], typeId: number): AeronCounter | undefined {
  return counters.find((c) => c.typeId === typeId)
}

export function counterByLabel(counters: AeronCounter[], label: string): AeronCounter | undefined {
  return counters.find((c) => c.label.startsWith(label))
}

export function totalErrors(counters: AeronCounter[]): number {
  return (counterByType(counters, COUNTER_TYPE.CLUSTER_ERRORS)?.value ?? 0) +
    (counterByType(counters, COUNTER_TYPE.CONTAINER_ERRORS)?.value ?? 0)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function formatNsAsMs(ns: number): string {
  return `${(ns / 1_000_000).toFixed(1)} ms`
}

export function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return 'Full'
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`
  if (seconds < 604800) return `${(seconds / 86400).toFixed(1)}d`
  if (seconds < 31536000) return `${(seconds / 604800).toFixed(1)}w`
  return `${(seconds / 31536000).toFixed(1)}y`
}

export function formatGrowthRate(bytesPerHour: number): string {
  if (bytesPerHour === 0) return 'stable'
  const sign = bytesPerHour > 0 ? '+' : ''
  return `${sign}${formatBytes(Math.abs(bytesPerHour))}/hr`
}
