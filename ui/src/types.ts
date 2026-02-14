export interface ClusterMetrics {
  nodeRole: string
  commitPosition: number
  logPosition: number
  appendPosition: number
  leaderMemberId: number
  connectedClientCount: number
  electionState: string
}

export interface AeronCounter {
  counterId: number
  label: string
  value: number
  typeId: number
}

export interface ArchiveRecording {
  recordingId: number
  streamId: number
  channel: string
  startPosition: number
  stopPosition: number
  startTimestamp: number
  stopTimestamp: number
}

export interface SystemMetrics {
  heapUsedBytes: number
  heapMaxBytes: number
  cpuUsage: number
  gcCount: number
  gcTimeMs: number
}

export interface MetricsReport {
  nodeId: number
  timestamp: number
  agentConnected?: boolean
  agentMode?: string
  clusterMetrics: ClusterMetrics
  counters: AeronCounter[]
  recordings: ArchiveRecording[]
  systemMetrics: SystemMetrics
}

export interface ClusterOverview {
  nodes: Record<string, MetricsReport>
  leaderNodeId?: number
  timestamp: number
}

export interface Alert {
  type: string
  nodeId: number
  timestamp: number
  message?: string
}
