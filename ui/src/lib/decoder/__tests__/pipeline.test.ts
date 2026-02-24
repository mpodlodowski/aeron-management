import { describe, it, expect, beforeEach } from 'vitest'
import { decodeChunk } from '../pipeline'
import { DecoderRegistry } from '../registry'
import { FRAME_HEADER_LENGTH, FRAME_ALIGNMENT } from '../builtins/frameDecoder'
import { SBE_HEADER_LENGTH } from '../builtins/sbeHeaderDecoder'

function align(value: number, alignment: number): number {
  return (value + alignment - 1) & ~(alignment - 1)
}

function buildFrame(sbePayload: Uint8Array, streamId = 100): Uint8Array {
  const frameLength = FRAME_HEADER_LENGTH + sbePayload.length
  const aligned = align(frameLength, FRAME_ALIGNMENT)
  const buf = new Uint8Array(aligned)
  const view = new DataView(buf.buffer)
  view.setInt32(0, frameLength, true)      // frameLength
  view.setUint8(5, 0x80)                   // flags
  view.setUint16(6, 1, true)               // type = DATA
  view.setInt32(16, streamId, true)        // streamId
  buf.set(sbePayload, FRAME_HEADER_LENGTH)
  return buf
}

function buildSbeMessage(templateId: number, schemaId: number, payload: Uint8Array): Uint8Array {
  const buf = new Uint8Array(SBE_HEADER_LENGTH + payload.length)
  const view = new DataView(buf.buffer)
  view.setUint16(0, payload.length, true)  // blockLength
  view.setUint16(2, templateId, true)
  view.setUint16(4, schemaId, true)
  view.setUint16(6, 1, true)              // version
  buf.set(payload, SBE_HEADER_LENGTH)
  return buf
}

function buildPaddingFrame(size: number): Uint8Array {
  const aligned = align(size, FRAME_ALIGNMENT)
  const buf = new Uint8Array(aligned)
  const view = new DataView(buf.buffer)
  view.setInt32(0, size, true)             // frameLength
  view.setUint16(6, 0, true)              // type = PAD
  return buf
}

describe('decodeChunk', () => {
  let registry: DecoderRegistry

  beforeEach(() => {
    localStorage.clear()
    registry = new DecoderRegistry()
  })

  it('decodes a single DATA frame with SBE header', () => {
    const payload = new Uint8Array(16)
    const sbe = buildSbeMessage(99, 200, payload)
    const frame = buildFrame(sbe)

    const { messages } = decodeChunk(frame, 0, registry)
    expect(messages).toHaveLength(1)
    expect(messages[0].label).toBe('Schema 200 / Template 99')
    expect(messages[0].templateId).toBe(99)
    expect(messages[0].schemaId).toBe(200)

    const frameLayers = messages[0].fields.filter(f => f.layer === 'frame')
    const sbeLayers = messages[0].fields.filter(f => f.layer === 'sbe')
    expect(frameLayers).toHaveLength(9)
    expect(sbeLayers).toHaveLength(4)
  })

  it('decodes multiple consecutive frames', () => {
    const p1 = buildFrame(buildSbeMessage(1, 111, new Uint8Array(40)))
    const p2 = buildFrame(buildSbeMessage(2, 100, new Uint8Array(8)))
    const data = new Uint8Array(p1.length + p2.length)
    data.set(p1, 0)
    data.set(p2, p1.length)

    const { messages } = decodeChunk(data, 1000, registry)
    expect(messages).toHaveLength(2)
    expect(messages[0].offset).toBe(1000)
    expect(messages[1].offset).toBe(1000 + p1.length)
  })

  it('skips padding frames', () => {
    const pad = buildPaddingFrame(32)
    const frame = buildFrame(buildSbeMessage(1, 100, new Uint8Array(8)))
    const data = new Uint8Array(pad.length + frame.length)
    data.set(pad, 0)
    data.set(frame, pad.length)

    const { messages } = decodeChunk(data, 0, registry)
    expect(messages).toHaveLength(1)
    expect(messages[0].localOffset).toBe(pad.length)
  })

  it('applies built-in SnapshotMarker decoder for schema 111 template 100', () => {
    const markerPayload = new Uint8Array(40)
    const markerView = new DataView(markerPayload.buffer)
    markerView.setInt32(28, 0, true) // mark = BEGIN
    const sbe = buildSbeMessage(100, 111, markerPayload)
    const frame = buildFrame(sbe)

    const { messages } = decodeChunk(frame, 0, registry)
    expect(messages).toHaveLength(1)
    expect(messages[0].label).toBe('SnapshotMarker')
    const payloadFields = messages[0].fields.filter(f => f.layer === 'payload')
    expect(payloadFields.length).toBeGreaterThan(0)
    expect(payloadFields.find(f => f.name === 'mark')!.value).toBe('BEGIN (0)')
  })

  it('skips zero-padding between aligned frames', () => {
    const frame = buildFrame(buildSbeMessage(1, 100, new Uint8Array(8)))
    // Add 32 bytes of zero-padding after the frame, then another frame
    const frame2 = buildFrame(buildSbeMessage(2, 200, new Uint8Array(8)))
    const data = new Uint8Array(frame.length + FRAME_ALIGNMENT + frame2.length)
    data.set(frame, 0)
    // zeros in the middle (already zero-initialized)
    data.set(frame2, frame.length + FRAME_ALIGNMENT)

    const { messages } = decodeChunk(data, 0, registry)
    expect(messages).toHaveLength(2)
  })

  it('handles frame with no SBE payload (frameLength == header only)', () => {
    const buf = new Uint8Array(FRAME_ALIGNMENT)
    const view = new DataView(buf.buffer)
    view.setInt32(0, FRAME_HEADER_LENGTH, true)
    view.setUint16(6, 1, true) // DATA
    const { messages } = decodeChunk(buf, 0, registry)
    expect(messages).toHaveLength(1)
    expect(messages[0].fields.filter(f => f.layer === 'sbe')).toHaveLength(0)
  })

  it('returns frame-aligned nextOffset after last complete frame', () => {
    const frame = buildFrame(buildSbeMessage(1, 100, new Uint8Array(8)))
    const result = decodeChunk(frame, 500, registry)
    expect(result.nextOffset).toBe(500 + frame.length)
    expect(result.nextFetchSize).toBe(65536)
  })

  it('returns nextOffset at truncated frame start when frame spans chunk boundary', () => {
    const frame1 = buildFrame(buildSbeMessage(1, 100, new Uint8Array(8)))
    // Create a buffer that has frame1 + a partial frame header claiming 1000 bytes
    const data = new Uint8Array(frame1.length + FRAME_HEADER_LENGTH)
    data.set(frame1, 0)
    const view = new DataView(data.buffer)
    view.setInt32(frame1.length, 1000, true)      // frameLength = 1000 (exceeds buffer)
    view.setUint16(frame1.length + 6, 1, true)    // type = DATA

    const result = decodeChunk(data, 200, registry)
    expect(result.messages).toHaveLength(2)
    expect(result.messages[1].label).toContain('Truncated')
    expect(result.nextOffset).toBe(200 + frame1.length) // start of truncated frame
    expect(result.nextFetchSize).toBe(65536) // 1000 < default chunk size
  })

  it('returns larger nextFetchSize when truncated frame exceeds default chunk', () => {
    // Single frame header claiming 100000 bytes (larger than 64KB default)
    const data = new Uint8Array(FRAME_HEADER_LENGTH + 32)
    const view = new DataView(data.buffer)
    view.setInt32(0, 100000, true)     // frameLength = 100000
    view.setUint16(6, 1, true)        // type = DATA

    const result = decodeChunk(data, 0, registry)
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].label).toContain('Truncated')
    expect(result.nextOffset).toBe(0)
    expect(result.nextFetchSize).toBeGreaterThanOrEqual(100000)
  })
})
