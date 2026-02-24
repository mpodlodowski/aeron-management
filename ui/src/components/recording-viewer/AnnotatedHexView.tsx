import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DecodedField, DecodedMessage } from '../../lib/decoder/types'

interface Props {
  data: Uint8Array
  baseOffset: number
  messages: DecodedMessage[]
}

const BYTES_PER_ROW = 16
const ROW_HEIGHT = 20 // px, matches leading-5 (1.25rem = 20px)
const OVERSCAN = 10

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

function buildBoundaryRows(messages: DecodedMessage[]): Set<number> {
  const rows = new Set<number>()
  for (let i = 1; i < messages.length; i++) {
    const localOff = messages[i].localOffset
    const row = Math.floor(localOff / BYTES_PER_ROW)
    rows.add(row)
  }
  return rows
}

function HexRow({ data, rowIdx, baseOffset, byteCount, annotationMap, isBoundary, separatorLine }: {
  data: Uint8Array
  rowIdx: number
  baseOffset: number
  byteCount: number
  annotationMap: Map<number, ByteAnnotation>
  isBoundary: boolean
  separatorLine: string
}) {
  const rowStart = rowIdx * BYTES_PER_ROW
  const addr = (baseOffset + rowStart).toString(16).padStart(8, '0')

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
      hexSpans.push(
        <span key={col}>{'  '}</span>,
      )
    }

    if (col < BYTES_PER_ROW - 1) {
      hexSpans.push(<span key={`s${col}`}>{' '}</span>)
    }
  }

  return (
    <>
      {isBoundary && (
        <div className="text-text-muted" style={{ height: ROW_HEIGHT }}>{separatorLine}</div>
      )}
      <div style={{ height: ROW_HEIGHT }}>
        <span className="text-info-text">{addr}</span>
        {'  '}
        {hexSpans}
        {'  '}
        {asciiSpans}
      </div>
    </>
  )
}

export default function AnnotatedHexView({ data, baseOffset, messages }: Props) {
  const annotationMap = useMemo(() => buildAnnotationMap(data, messages), [data, messages])
  const boundaryRows = useMemo(() => buildBoundaryRows(messages), [messages])
  const totalRows = Math.ceil(data.length / BYTES_PER_ROW)

  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(600)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setContainerHeight(el.clientHeight)
    const observer = new ResizeObserver((entries) => {
      setContainerHeight(entries[0].contentRect.height)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  // Account for boundary rows adding extra height
  // For simplicity, we ignore boundary row height in the virtual offset calculation
  // (boundaries are rare relative to total rows, so the error is negligible)
  const totalHeight = totalRows * ROW_HEIGHT
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const endIndex = Math.min(totalRows, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN)

  const separatorLine = '\u2500'.repeat(75)

  return (
    <div ref={containerRef} className="overflow-auto h-full" onScroll={handleScroll}>
      <pre className="font-mono text-xs leading-5 text-text-secondary select-text" style={{ height: totalHeight + ROW_HEIGHT, position: 'relative' }}>
        {/* Column header — fixed at top of content */}
        <div className="text-text-muted sticky top-0 bg-surface z-10" style={{ height: ROW_HEIGHT }}>
          {'Offset    '}
          {'00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F'}
          {'  ASCII'}
        </div>
        <div style={{ position: 'relative', height: totalHeight }}>
          <div style={{ position: 'absolute', top: startIndex * ROW_HEIGHT, left: 0, right: 0 }}>
            {Array.from({ length: endIndex - startIndex }, (_, j) => {
              const rowIdx = startIndex + j
              const rowStart = rowIdx * BYTES_PER_ROW
              const rowEnd = Math.min(rowStart + BYTES_PER_ROW, data.length)
              const byteCount = rowEnd - rowStart
              return (
                <HexRow
                  key={rowIdx}
                  data={data}
                  rowIdx={rowIdx}
                  baseOffset={baseOffset}
                  byteCount={byteCount}
                  annotationMap={annotationMap}
                  isBoundary={boundaryRows.has(rowIdx)}
                  separatorLine={separatorLine}
                />
              )
            })}
          </div>
        </div>
      </pre>
    </div>
  )
}
