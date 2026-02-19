import type { Decoder, DecoderResult, DecodedField } from '../types'

// --- Enums ---

const CLOSE_REASON: Record<number, string> = {
  0: 'CLIENT_ACTION',
  1: 'SERVICE_ACTION',
  2: 'TIMEOUT',
}

const EVENT_CODE: Record<number, string> = {
  0: 'OK',
  1: 'ERROR',
  2: 'REDIRECT',
  3: 'AUTHENTICATION_REJECTED',
  4: 'CLOSED',
}

const CLUSTER_ACTION: Record<number, string> = {
  0: 'SUSPEND',
  1: 'RESUME',
  2: 'SNAPSHOT',
}

const CLUSTER_TIME_UNIT: Record<number, string> = {
  0: 'MILLIS',
  1: 'MICROS',
  2: 'NANOS',
}

const SNAPSHOT_MARK: Record<number, string> = {
  0: 'BEGIN',
  1: 'SECTION',
  2: 'END',
}

// --- Declarative field specs ---

type FieldSpec =
  | [name: string, reader: 'i32', size: 4]
  | [name: string, reader: 'i64', size: 8]
  | [name: string, reader: 'u8', size: 1]
  | [name: string, reader: 'enum32', size: 4, values: Record<number, string>]

function readField(view: DataView, offset: number, spec: FieldSpec): string | number | bigint {
  switch (spec[1]) {
    case 'i32': return view.getInt32(offset, true)
    case 'i64': return view.getBigInt64(offset, true)
    case 'u8': return view.getUint8(offset)
    case 'enum32': {
      const v = view.getInt32(offset, true)
      const label = spec[3][v]
      return label ? `${label} (${v})` : String(v)
    }
  }
}

function fieldType(spec: FieldSpec): string {
  switch (spec[1]) {
    case 'i32': return 'int32'
    case 'i64': return 'int64'
    case 'u8': return 'uint8'
    case 'enum32': return 'enum'
  }
}

function defineDecoder(name: string, fields: FieldSpec[], hasVarData = false): Decoder {
  const blockSize = fields.reduce((s, f) => s + f[2], 0)
  const description = `Aeron Cluster ${name} (schema 111)${hasVarData ? ' — fixed block only, var data follows' : ''}`
  return {
    name,
    description,
    decode(view: DataView, offset: number, available: number): DecoderResult | null {
      if (available < blockSize) return null
      let pos = offset
      const decoded: DecodedField[] = fields.map((spec) => {
        const field: DecodedField = {
          name: spec[0],
          value: readField(view, pos, spec),
          type: fieldType(spec),
          offset: pos,
          size: spec[2],
          layer: 'payload',
        }
        pos += spec[2]
        return field
      })
      return { fields: decoded, size: blockSize, label: name }
    },
  }
}

// --- Schema 111 decoders ---

/** All built-in decoders for Aeron Cluster ConsensusModule (schema 111). */
export const clusterCodecDecoders: ReadonlyMap<number, Decoder> = new Map<number, Decoder>([
  // Session protocol
  [1, defineDecoder('SessionMessageHeader', [
    ['leadershipTermId', 'i64', 8],
    ['clusterSessionId', 'i64', 8],
    ['timestamp', 'i64', 8],
  ])],
  [2, defineDecoder('SessionEvent', [
    ['clusterSessionId', 'i64', 8],
    ['correlationId', 'i64', 8],
    ['leadershipTermId', 'i64', 8],
    ['leaderMemberId', 'i32', 4],
    ['code', 'enum32', 4, EVENT_CODE],
    ['version', 'i32', 4],
  ], true)],

  // State machine log
  [20, defineDecoder('TimerEvent', [
    ['leadershipTermId', 'i64', 8],
    ['correlationId', 'i64', 8],
    ['timestamp', 'i64', 8],
  ])],
  [21, defineDecoder('SessionOpenEvent', [
    ['leadershipTermId', 'i64', 8],
    ['correlationId', 'i64', 8],
    ['clusterSessionId', 'i64', 8],
    ['timestamp', 'i64', 8],
    ['responseStreamId', 'i32', 4],
  ], true)],
  [22, defineDecoder('SessionCloseEvent', [
    ['leadershipTermId', 'i64', 8],
    ['clusterSessionId', 'i64', 8],
    ['timestamp', 'i64', 8],
    ['closeReason', 'enum32', 4, CLOSE_REASON],
  ])],
  [23, defineDecoder('ClusterActionRequest', [
    ['leadershipTermId', 'i64', 8],
    ['logPosition', 'i64', 8],
    ['timestamp', 'i64', 8],
    ['action', 'enum32', 4, CLUSTER_ACTION],
    ['flags', 'i32', 4],
  ])],
  [24, defineDecoder('NewLeadershipTermEvent', [
    ['leadershipTermId', 'i64', 8],
    ['logPosition', 'i64', 8],
    ['timestamp', 'i64', 8],
    ['termBaseLogPosition', 'i64', 8],
    ['leaderMemberId', 'i32', 4],
    ['logSessionId', 'i32', 4],
    ['timeUnit', 'enum32', 4, CLUSTER_TIME_UNIT],
    ['appVersion', 'i32', 4],
  ])],

  // Snapshot serialization
  [100, defineDecoder('SnapshotMarker', [
    ['typeId', 'i64', 8],
    ['logPosition', 'i64', 8],
    ['leadershipTermId', 'i64', 8],
    ['index', 'i32', 4],
    ['mark', 'enum32', 4, SNAPSHOT_MARK],
    ['timeUnit', 'enum32', 4, CLUSTER_TIME_UNIT],
    ['appVersion', 'i32', 4],
  ])],
  [102, defineDecoder('ClientSession', [
    ['clusterSessionId', 'i64', 8],
    ['responseStreamId', 'i32', 4],
  ], true)],
  [103, defineDecoder('ClusterSession', [
    ['clusterSessionId', 'i64', 8],
    ['correlationId', 'i64', 8],
    ['openedLogPosition', 'i64', 8],
    ['timeOfLastActivity', 'i64', 8],
    ['closeReason', 'enum32', 4, CLOSE_REASON],
    ['responseStreamId', 'i32', 4],
  ], true)],
  [104, defineDecoder('Timer', [
    ['correlationId', 'i64', 8],
    ['deadline', 'i64', 8],
  ])],
  [105, defineDecoder('ConsensusModule', [
    ['nextSessionId', 'i64', 8],
    ['nextServiceSessionId', 'i64', 8],
    ['logServiceSessionId', 'i64', 8],
    ['pendingMessageCapacity', 'i32', 4],
  ])],
  [106, defineDecoder('ClusterMembers', [
    ['memberId', 'i32', 4],
    ['highMemberId', 'i32', 4],
  ], true)],
  [107, defineDecoder('PendingMessageTracker', [
    ['nextServiceSessionId', 'i64', 8],
    ['logServiceSessionId', 'i64', 8],
    ['pendingMessageCapacity', 'i32', 4],
    ['serviceId', 'i32', 4],
  ])],

  // Service control
  [30, defineDecoder('CloseSession', [
    ['clusterSessionId', 'i64', 8],
  ])],
  [31, defineDecoder('ScheduleTimer', [
    ['correlationId', 'i64', 8],
    ['deadline', 'i64', 8],
  ])],
  [32, defineDecoder('CancelTimer', [
    ['correlationId', 'i64', 8],
  ])],
  [33, defineDecoder('ServiceAck', [
    ['logPosition', 'i64', 8],
    ['timestamp', 'i64', 8],
    ['ackId', 'i64', 8],
    ['relevantId', 'i64', 8],
    ['serviceId', 'i32', 4],
  ])],

  // Consensus protocol
  [54, defineDecoder('AppendPosition', [
    ['leadershipTermId', 'i64', 8],
    ['logPosition', 'i64', 8],
    ['followerMemberId', 'i32', 4],
    ['flags', 'i32', 4],
  ])],
  [55, defineDecoder('CommitPosition', [
    ['leadershipTermId', 'i64', 8],
    ['logPosition', 'i64', 8],
    ['leaderMemberId', 'i32', 4],
  ])],
])
