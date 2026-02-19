import { describe, it, expect } from 'vitest'
import { decodeSbeHeader, SBE_HEADER_LENGTH } from '../builtins/sbeHeaderDecoder'

function makeSbeHeader(blockLength: number, templateId: number, schemaId: number, version: number): DataView {
  const buf = new ArrayBuffer(8)
  const view = new DataView(buf)
  view.setUint16(0, blockLength, true)
  view.setUint16(2, templateId, true)
  view.setUint16(4, schemaId, true)
  view.setUint16(6, version, true)
  return view
}

describe('decodeSbeHeader', () => {
  it('decodes SBE header fields', () => {
    const view = makeSbeHeader(40, 1, 111, 9)
    const result = decodeSbeHeader(view, 0)

    expect(result.fields).toHaveLength(4)
    expect(result.templateId).toBe(1)
    expect(result.schemaId).toBe(111)
    expect(result.fields[0]).toMatchObject({ name: 'blockLength', value: 40, layer: 'sbe' })
    expect(result.fields[3]).toMatchObject({ name: 'sbeVersion', value: 9 })
  })

  it('SBE_HEADER_LENGTH is 8', () => {
    expect(SBE_HEADER_LENGTH).toBe(8)
  })
})
