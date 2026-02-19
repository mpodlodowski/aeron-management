import { describe, it, expect } from 'vitest'
import { clusterCodecDecoders } from '../builtins/clusterCodecDecoders'

const snapshotMarkerDecoder = clusterCodecDecoders.get(100)!

function makeSnapshotMarker(mark: number, logPosition: bigint): DataView {
  const buf = new ArrayBuffer(40)
  const view = new DataView(buf)
  view.setBigInt64(0, 0n, true)              // typeId
  view.setBigInt64(8, logPosition, true)      // logPosition
  view.setBigInt64(16, 42n, true)             // leadershipTermId
  view.setInt32(24, 0, true)                  // index
  view.setInt32(28, mark, true)               // mark
  view.setInt32(32, 0, true)                  // timeUnit
  view.setInt32(36, 1, true)                  // appVersion
  return view
}

describe('snapshotMarkerDecoder', () => {
  it('decodes BEGIN marker', () => {
    const view = makeSnapshotMarker(0, 1140850688n)
    const result = snapshotMarkerDecoder.decode(view, 0, 40)!

    expect(result).not.toBeNull()
    expect(result.label).toBe('SnapshotMarker')
    const markField = result.fields.find(f => f.name === 'mark')!
    expect(markField.value).toBe('BEGIN (0)')
    const logField = result.fields.find(f => f.name === 'logPosition')!
    expect(logField.value).toBe(1140850688n)
  })

  it('decodes SECTION marker', () => {
    const view = makeSnapshotMarker(1, 0n)
    const result = snapshotMarkerDecoder.decode(view, 0, 40)!
    const markField = result.fields.find(f => f.name === 'mark')!
    expect(markField.value).toBe('SECTION (1)')
  })

  it('decodes END marker', () => {
    const view = makeSnapshotMarker(2, 0n)
    const result = snapshotMarkerDecoder.decode(view, 0, 40)!
    const markField = result.fields.find(f => f.name === 'mark')!
    expect(markField.value).toBe('END (2)')
  })

  it('returns null if not enough bytes', () => {
    const buf = new ArrayBuffer(10)
    const view = new DataView(buf)
    expect(snapshotMarkerDecoder.decode(view, 0, 10)).toBeNull()
  })
})
