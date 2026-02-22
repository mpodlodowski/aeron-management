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
  error: 'bg-red-900/50 text-red-300',
  warning: 'bg-yellow-900/50 text-yellow-300',
  info: 'bg-blue-900/50 text-blue-300',
  success: 'bg-green-900/50 text-green-300',
}

export const SEVERITY_FILL: Record<EventSeverity, string> = {
  error: '#ef4444',
  warning: '#eab308',
  info: '#3b82f6',
  success: '#22c55e',
}
