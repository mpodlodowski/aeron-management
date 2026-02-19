import type { DecodedField, DecodedMessage } from './types'
import type { DecoderRegistry } from './registry'
import { decodeFrameHeader, FRAME_HEADER_LENGTH, FRAME_ALIGNMENT } from './builtins/frameDecoder'
import { decodeSbeHeader, SBE_HEADER_LENGTH } from './builtins/sbeHeaderDecoder'

function align(value: number, alignment: number): number {
  return (value + alignment - 1) & ~(alignment - 1)
}

export function decodeChunk(
  data: Uint8Array,
  baseOffset: number,
  registry: DecoderRegistry,
): DecodedMessage[] {
  const messages: DecodedMessage[] = []
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let pos = 0

  while (pos + FRAME_HEADER_LENGTH <= data.length) {
    const frameLength = view.getInt32(pos, true)

    if (frameLength <= 0) {
      // Zero or negative frameLength — skip to next alignment boundary
      pos = align(pos + 1, FRAME_ALIGNMENT)
      continue
    }

    if (pos + frameLength > data.length) break

    const frameType = view.getUint16(pos + 6, true)
    if (frameType === 0) {
      pos += align(frameLength, FRAME_ALIGNMENT)
      continue
    }

    const fields: DecodedField[] = []
    const frameResult = decodeFrameHeader(view, pos)
    fields.push(...frameResult.fields)

    let label = 'Data'
    let templateId: number | undefined
    let schemaId: number | undefined

    const payloadStart = pos + FRAME_HEADER_LENGTH
    const payloadSize = frameLength - FRAME_HEADER_LENGTH

    if (payloadSize >= SBE_HEADER_LENGTH) {
      const sbeResult = decodeSbeHeader(view, payloadStart)
      fields.push(...sbeResult.fields)
      templateId = sbeResult.templateId
      schemaId = sbeResult.schemaId
      label = `Schema ${schemaId} / Template ${templateId}`

      const decoder = registry.getDecoder(schemaId, templateId)
      if (decoder) {
        const decoderOffset = payloadStart + SBE_HEADER_LENGTH
        const decoderAvailable = payloadSize - SBE_HEADER_LENGTH
        const result = decoder.decode(view, decoderOffset, decoderAvailable)
        if (result) {
          fields.push(...result.fields)
          if (result.label) label = result.label
        }
      }
    }

    messages.push({
      offset: baseOffset + pos,
      localOffset: pos,
      frameLength,
      fields,
      templateId,
      schemaId,
      label,
      raw: data.slice(pos, pos + frameLength),
    })

    pos += align(frameLength, FRAME_ALIGNMENT)
  }

  return messages
}
