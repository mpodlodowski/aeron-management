export type EventSeverity = 'error' | 'warning' | 'info' | 'success'

const SEVERITY_MAP: Record<string, EventSeverity> = {
  // Error — needs attention
  CONSENSUS_LOST: 'error',
  NODE_DOWN: 'error',
  NODE_CNC_LOST: 'error',
  AGENT_DISCONNECTED: 'error',
  MONITORING_GAP: 'error',

  // Warning — notable
  ELECTION_STARTED: 'warning',
  CLUSTER_SUSPENDED: 'warning',
  CLUSTER_SHUTDOWN: 'warning',

  // Success — positive
  CONSENSUS_ESTABLISHED: 'success',
  NODE_UP: 'success',
  AGENT_CONNECTED: 'success',
  NODE_CNC_ACCESSIBLE: 'success',
  CLUSTER_START: 'success',
  CLUSTER_RESUMED: 'success',

  // Info — everything else
  LEADER_ELECTED: 'info',
  ELECTION_COMPLETED: 'info',
  ROLE_CHANGE: 'info',
  MODULE_STATE_CHANGE: 'info',
  SNAPSHOT_TAKEN: 'info',
  SNAPSHOT_REQUESTED: 'info',
  NODE_ACTION: 'info',
  EGRESS_RECORD_STARTED: 'info',
  EGRESS_RECORD_STOPPED: 'info',
}

export function getEventSeverity(eventType: string): EventSeverity {
  return SEVERITY_MAP[eventType] ?? 'info'
}

export const SEVERITY_BADGE: Record<EventSeverity, string> = {
  error: 'bg-critical-surface text-critical-text',
  warning: 'bg-warning-surface text-warning-text',
  info: 'bg-elevated text-text-secondary',
  success: 'bg-elevated text-text-secondary',
}

export const SEVERITY_FILL: Record<EventSeverity, string> = {
  error: 'var(--critical-text)',
  warning: 'var(--warning-text)',
  info: 'var(--info-text)',
  success: 'var(--success-text)',
}
