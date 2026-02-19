import type { DecodedField } from '../types'

export const FRAME_HEADER_LENGTH = 32
export const FRAME_ALIGNMENT = 32

const FRAME_TYPES: Record<number, string> = {
  0x00: 'PAD',
  0x01: 'DATA',
  0x02: 'NAK',
  0x05: 'SETUP',
  0x06: 'HEARTBEAT',
}

export function decodeFrameHeader(view: DataView, offset: number): { fields: DecodedField[] } {
  const frameLength = view.getInt32(offset, true)
  const version = view.getUint8(offset + 4)
  const flags = view.getUint8(offset + 5)
  const frameType = view.getUint16(offset + 6, true)
  const termOffset = view.getInt32(offset + 8, true)
  const sessionId = view.getInt32(offset + 12, true)
  const streamId = view.getInt32(offset + 16, true)
  const termId = view.getInt32(offset + 20, true)
  const reservedValue = view.getBigInt64(offset + 24, true)

  const typeName = FRAME_TYPES[frameType] ?? `UNKNOWN`
  const typeDisplay = `${typeName} (0x${frameType.toString(16).padStart(2, '0')})`

  return {
    fields: [
      { name: 'frameLength', value: frameLength, type: 'int32', offset, size: 4, layer: 'frame' },
      { name: 'version', value: version, type: 'uint8', offset: offset + 4, size: 1, layer: 'frame' },
      { name: 'flags', value: `0x${flags.toString(16).padStart(2, '0')}`, type: 'hex', offset: offset + 5, size: 1, layer: 'frame' },
      { name: 'type', value: typeDisplay, type: 'enum', offset: offset + 6, size: 2, layer: 'frame' },
      { name: 'termOffset', value: termOffset, type: 'int32', offset: offset + 8, size: 4, layer: 'frame' },
      { name: 'sessionId', value: sessionId, type: 'int32', offset: offset + 12, size: 4, layer: 'frame' },
      { name: 'streamId', value: streamId, type: 'int32', offset: offset + 16, size: 4, layer: 'frame' },
      { name: 'termId', value: termId, type: 'int32', offset: offset + 20, size: 4, layer: 'frame' },
      { name: 'reservedValue', value: reservedValue, type: 'int64', offset: offset + 24, size: 8, layer: 'frame' },
    ],
  }
}
