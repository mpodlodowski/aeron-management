import type { DecodedField } from '../types'

export const SBE_HEADER_LENGTH = 8

export function decodeSbeHeader(view: DataView, offset: number): {
  fields: DecodedField[]
  templateId: number
  schemaId: number
  blockLength: number
  version: number
} {
  const blockLength = view.getUint16(offset, true)
  const templateId = view.getUint16(offset + 2, true)
  const schemaId = view.getUint16(offset + 4, true)
  const version = view.getUint16(offset + 6, true)

  return {
    templateId,
    schemaId,
    blockLength,
    version,
    fields: [
      { name: 'blockLength', value: blockLength, type: 'uint16', offset, size: 2, layer: 'sbe' },
      { name: 'templateId', value: templateId, type: 'uint16', offset: offset + 2, size: 2, layer: 'sbe' },
      { name: 'schemaId', value: schemaId, type: 'uint16', offset: offset + 4, size: 2, layer: 'sbe' },
      { name: 'sbeVersion', value: version, type: 'uint16', offset: offset + 6, size: 2, layer: 'sbe' },
    ],
  }
}
