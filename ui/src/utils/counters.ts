import { AeronCounter } from '../types'

// Aeron cluster counter type IDs (verified against 1.46.5)
export const COUNTER_TYPE = {
  CLUSTER_ERRORS: 212,
  CONTAINER_ERRORS: 215,
  SNAPSHOT_COUNT: 205,
  ELECTION_COUNT: 238,
  MAX_CYCLE_TIME_NS: 216,
} as const

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
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function formatNsAsMs(ns: number): string {
  return `${(ns / 1_000_000).toFixed(1)} ms`
}
