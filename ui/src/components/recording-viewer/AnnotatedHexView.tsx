import type { DecodedField, DecodedMessage } from '../../lib/decoder/types'

interface Props {
  data: Uint8Array
  baseOffset: number
  messages: DecodedMessage[]
}

const BYTES_PER_ROW = 16

const LAYER_CLASSES: Record<string, string> = {
  frame: 'text-info-text',
  sbe: 'text-warning-text',
  payload: 'text-emerald-300',
}
const DEFAULT_CLASS = 'text-text-muted'

interface ByteAnnotation {
  layer: DecodedField['layer']
  name: string
  value: string
  className: string
}

function toHex(byte: number): string {
  return byte.toString(16).padStart(2, '0')
}

function toAscii(byte: number): string {
  return byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : '.'
}

function formatValue(value: string | number | bigint | boolean): string {
  if (typeof value === 'bigint') return value.toString()
  return String(value)
}

/**
 * Build a per-byte annotation map from decoded messages.
 * For each field in each message, mark the bytes at field.offset..field.offset+field.size-1
 * with the field's layer, name, and value.
 */
function buildAnnotationMap(
  data: Uint8Array,
  messages: DecodedMessage[],
): Map<number, ByteAnnotation> {
  const map = new Map<number, ByteAnnotation>()

  for (const msg of messages) {
    for (const field of msg.fields) {
      const className = LAYER_CLASSES[field.layer] ?? DEFAULT_CLASS
      const annotation: ByteAnnotation = {
        layer: field.layer,
        name: field.name,
        value: formatValue(field.value),
        className,
      }
      for (let b = field.offset; b < field.offset + field.size && b < data.length; b++) {
        map.set(b, annotation)
      }
    }
  }

  return map
}

/**
 * Determine which rows contain a message boundary (a new message starts on that row).
 * We skip the very first message so we don't render a separator above the first row of data.
 */
function buildBoundaryRows(messages: DecodedMessage[]): Set<number> {
  const rows = new Set<number>()
  for (let i = 1; i < messages.length; i++) {
    const localOff = messages[i].localOffset
    const row = Math.floor(localOff / BYTES_PER_ROW)
    rows.add(row)
  }
  return rows
}

export default function AnnotatedHexView({ data, baseOffset, messages }: Props) {
  const annotationMap = buildAnnotationMap(data, messages)
  const boundaryRows = buildBoundaryRows(messages)
  const totalRows = Math.ceil(data.length / BYTES_PER_ROW)

  // Separator line: 8 (addr) + 2 (gap) + 47 (hex) + 2 (gap) + 16 (ascii) = 75
  const separatorLine = '\u2500'.repeat(75)

  return (
    <pre className="font-mono text-xs leading-5 text-text-secondary select-text">
      {/* Column header */}
      <span className="text-text-muted">
        {'Offset    '}
        {'00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F'}
        {'  ASCII\n'}
      </span>
      {Array.from({ length: totalRows }, (_, rowIdx) => {
        const rowStart = rowIdx * BYTES_PER_ROW
        const rowEnd = Math.min(rowStart + BYTES_PER_ROW, data.length)
        const addr = (baseOffset + rowStart).toString(16).padStart(8, '0')
        const byteCount = rowEnd - rowStart

        // Build hex spans and ascii spans with annotations
        const hexSpans: React.ReactNode[] = []
        const asciiSpans: React.ReactNode[] = []

        for (let col = 0; col < BYTES_PER_ROW; col++) {
          const byteIdx = rowStart + col
          if (col < byteCount) {
            const byte = data[byteIdx]
            const annotation = annotationMap.get(byteIdx)
            const className = annotation?.className ?? DEFAULT_CLASS
            const title = annotation
              ? `${annotation.name}: ${annotation.value}`
              : undefined

            hexSpans.push(
              <span key={col} className={className} title={title}>
                {toHex(byte)}
              </span>,
            )

            asciiSpans.push(
              <span key={col} className={className} title={title}>
                {toAscii(byte)}
              </span>,
            )
          } else {
            // Padding for incomplete last row
            hexSpans.push(
              <span key={col}>{'  '}</span>,
            )
          }

          // Add space separator between hex bytes (but not after the last column)
          if (col < BYTES_PER_ROW - 1) {
            hexSpans.push(<span key={`s${col}`}>{' '}</span>)
          }
        }

        return (
          <span key={rowIdx}>
            {boundaryRows.has(rowIdx) && (
              <span className="text-text-muted">{separatorLine}{'\n'}</span>
            )}
            <span className="text-info-text">{addr}</span>
            {'  '}
            {hexSpans}
            {'  '}
            {asciiSpans}
            {'\n'}
          </span>
        )
      })}
    </pre>
  )
}
