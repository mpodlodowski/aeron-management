import { describe, it, expect } from 'vitest'
import { decodeFrameHeader, FRAME_HEADER_LENGTH, FRAME_ALIGNMENT } from '../builtins/frameDecoder'

function makeFrame(frameLength: number, type: number, sessionId: number, streamId: number, termId: number): DataView {
  const buf = new ArrayBuffer(32)
  const view = new DataView(buf)
  view.setInt32(0, frameLength, true)   // frameLength
  view.setUint8(4, 0)                   // version
  view.setUint8(5, 0x80)                // flags (BEGIN)
  view.setUint16(6, type, true)         // type
  view.setInt32(8, 0, true)             // termOffset
  view.setInt32(12, sessionId, true)    // sessionId
  view.setInt32(16, streamId, true)     // streamId
  view.setInt32(20, termId, true)       // termId
  view.setBigInt64(24, 0n, true)        // reservedValue
  return view
}

describe('decodeFrameHeader', () => {
  it('decodes a DATA frame header', () => {
    const view = makeFrame(756, 1, -1490704999, 100, 17)
    const result = decodeFrameHeader(view, 0)

    expect(result.fields).toHaveLength(9)
    expect(result.fields[0]).toMatchObject({ name: 'frameLength', value: 756, layer: 'frame' })
    expect(result.fields[5]).toMatchObject({ name: 'sessionId', value: -1490704999 })
    expect(result.fields[6]).toMatchObject({ name: 'streamId', value: 100 })
    expect(result.fields[7]).toMatchObject({ name: 'termId', value: 17 })
    expect(result.fields[8]).toMatchObject({ name: 'reservedValue', value: 0n })
  })

  it('identifies frame type labels', () => {
    const view = makeFrame(32, 1, 0, 0, 0)
    const result = decodeFrameHeader(view, 0)
    const typeField = result.fields.find(f => f.name === 'type')!
    expect(typeField.value).toBe('DATA (0x01)')
  })

  it('has correct constants', () => {
    expect(FRAME_HEADER_LENGTH).toBe(32)
    expect(FRAME_ALIGNMENT).toBe(32)
  })
})
