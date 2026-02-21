import type { DecodedField, DecodedMessage } from './types'
import type { DecoderRegistry } from './registry'
import { decodeFrameHeader, FRAME_HEADER_LENGTH, FRAME_ALIGNMENT } from './builtins/frameDecoder'
import { decodeSbeHeader, SBE_HEADER_LENGTH } from './builtins/sbeHeaderDecoder'

function align(value: number, alignment: number): number {
  return (value + alignment - 1) & ~(alignment - 1)
}

function isPrintableUtf8(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    // Allow tab, newline, carriage return, and printable ASCII
    if (b === 0x09 || b === 0x0a || b === 0x0d) continue
    if (b >= 0x20 && b <= 0x7e) continue
    // Allow valid multi-byte UTF-8 lead bytes
    if (b >= 0xc2 && b <= 0xf4) continue
    // Allow UTF-8 continuation bytes
    if (b >= 0x80 && b <= 0xbf) continue
    return false
  }
  return bytes.length > 0
}

function formatHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ')
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

          // Extract trailing application body (e.g. after SessionMessageHeader)
          const bodyStart = decoderOffset + result.size
          const bodySize = decoderAvailable - result.size
          if (bodySize > 0) {
            let decoded = false
            // Try nested SBE decoding if body is large enough for an SBE header
            if (bodySize >= SBE_HEADER_LENGTH) {
              const nestedSbe = decodeSbeHeader(view, bodyStart)
              // Sanity check: blockLength must fit within remaining bytes
              if (nestedSbe.blockLength > 0
                && nestedSbe.blockLength <= bodySize - SBE_HEADER_LENGTH
                && nestedSbe.schemaId > 0
                && nestedSbe.templateId > 0) {
                // Always show the nested SBE header
                fields.push(...nestedSbe.fields.map(f => ({ ...f, layer: 'nested-sbe' as const })))
                const nestedOffset = bodyStart + SBE_HEADER_LENGTH
                const nestedAvailable = bodySize - SBE_HEADER_LENGTH
                // Update label to reflect nested payload type
                const outerLabel = label
                label = `${outerLabel} > Schema ${nestedSbe.schemaId} / Template ${nestedSbe.templateId}`
                const nestedDecoder = registry.getDecoder(nestedSbe.schemaId, nestedSbe.templateId)
                if (nestedDecoder) {
                  const nestedResult = nestedDecoder.decode(view, nestedOffset, nestedAvailable)
                  if (nestedResult) {
                    fields.push(...nestedResult.fields.map(f => ({ ...f, layer: 'nested-sbe' as const })))
                    if (nestedResult.label) {
                      label = `${outerLabel} > ${nestedResult.label}`
                    }
                    decoded = true
                  }
                }
                if (!decoded) {
                  // Show remaining bytes after nested SBE header as hex
                  const remaining = data.slice(nestedOffset, nestedOffset + nestedAvailable)
                  fields.push({
                    name: 'body',
                    value: formatHex(remaining),
                    type: 'bytes',
                    offset: nestedOffset,
                    size: nestedAvailable,
                    layer: 'nested-sbe',
                  })
                  decoded = true
                }
              }
            }
            if (!decoded) {
              const bodyBytes = data.slice(bodyStart, bodyStart + bodySize)
              const printable = isPrintableUtf8(bodyBytes)
              fields.push({
                name: 'body',
                value: printable
                  ? new TextDecoder().decode(bodyBytes)
                  : formatHex(bodyBytes),
                type: printable ? 'string' : 'bytes',
                offset: bodyStart,
                size: bodySize,
                layer: 'payload',
              })
            }
          }
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
