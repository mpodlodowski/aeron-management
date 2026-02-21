export interface ClusterMetrics {
  nodeRole: string
  commitPosition: number
  logPosition: number
  appendPosition: number
  leaderMemberId: number
  connectedClientCount: number
  electionState: string
  consensusModuleState: string
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
  archiveDiskUsedBytes: number
  archiveDiskAvailableBytes: number
  archiveDiskTotalBytes: number
}

export interface DiskGrowthStats {
  growthRate5m: number | null
  growthRate1h: number | null
  growthRate24h: number | null
  timeToFullSeconds: number | null
}

export interface EgressRecordingStatus {
  active: boolean
  recordingId: number
  startTimeMs: number
  durationLimitSeconds: number
  channel: string
  streamId: number
}

export interface MetricsReport {
  nodeId: number
  timestamp: number
  agentConnected?: boolean
  cncAccessible?: boolean
  nodeReachable?: boolean
  agentMode?: string
  clusterMetrics: ClusterMetrics
  counters: AeronCounter[]
  recordingCount: number
  recordingsTotalBytes: number
  systemMetrics: SystemMetrics
  diskGrowth?: DiskGrowthStats
  bytesSentPerSec?: number
  bytesRecvPerSec?: number
  egressRecording?: EgressRecordingStatus
}

export interface ClusterStats {
  commitPosition: number | null
  connectedClients: number
  leadershipTermId: number | null
  totalErrors: number
  totalSnapshots: number
  totalElections: number
  maxCycleTimeNs: number
  totalRecordings: number
  totalRecordingBytes: number
  totalDiskUsed: number
  totalDiskTotal: number
  clusterStartMs: number | null
  aeronVersion: string | null
}

export interface ClusterMember {
  id: number
  isLeader: boolean
  leadershipTermId: number
  logPosition: number
  ingressEndpoint: string
  consensusEndpoint: string
  logEndpoint: string
  catchupEndpoint: string
  archiveEndpoint: string
}

export interface ClusterMembership {
  memberId: number
  leaderMemberId: number
  currentTimeNs: number
  activeMembers: ClusterMember[]
  passiveMembers: ClusterMember[]
}

export interface ClusterOverview {
  nodes: Record<string, MetricsReport>
  leaderNodeId?: number
  clusterNodeCount?: number
  clusterState?: string
  clusterStats?: ClusterStats
  timestamp: number
}

export interface ClusterSummary {
  clusterId: string
  nodeCount: number
  clusterNodeCount: number
  leaderNodeId: number | null
  clusterState: string | null
  clusterStats: ClusterStats | null
  nodes: Record<string, MetricsReport>
}

export type RecordingType = string
export type RecordingState = 'VALID' | 'INVALID' | 'DELETED'

export interface RecordingRow extends ArchiveRecording {
  nodeId: number
  type: RecordingType
  state: RecordingState
}

export interface PaginatedRecordings {
  content: RecordingRow[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

export interface RecordingBytesResponse {
  recordingId: number
  offset: number
  length: number
  totalSize: number
  data: string // base64-encoded bytes
}

export type EventLevel = 'CLUSTER' | 'NODE' | 'AGENT'
export type EventSource = 'REALTIME' | 'RECONCILIATION' | 'CATCH_UP'

export interface ClusterEvent {
  id: string
  clusterId: string
  timestamp: number     // epoch millis
  level: EventLevel
  type: string
  nodeId: number | null
  agentId: string | null
  message: string
  username: string
  source: EventSource
  details: Record<string, unknown>
  createdAt: number
}

export interface HistogramBucket {
  from: number
  to: number
  cluster: number
  node: number
  agent: number
}

export interface EventHistogram {
  bucketSize: number
  buckets: HistogramBucket[]
}

export interface PaginatedEvents {
  content: ClusterEvent[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}
