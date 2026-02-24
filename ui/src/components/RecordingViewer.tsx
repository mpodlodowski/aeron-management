import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatBytes } from '../utils/counters'
import { decodeChunk, DecoderRegistry } from '../lib/decoder'
import type { DecodedMessage, ViewMode } from '../lib/decoder'
import AnnotatedHexView from './recording-viewer/AnnotatedHexView'
import TreeView from './recording-viewer/TreeView'
import MessageTableView from './recording-viewer/MessageTableView'
import DecoderEditor from './recording-viewer/DecoderEditor'

interface Props {
  clusterId: string
  nodeId: number
  recordingId: number
  totalSize: number
  initialOffset?: number
  initialViewMode?: ViewMode
  onClose?: () => void
  onStateChange?: (state: { offset: number; viewMode: ViewMode }) => void
}

const CHUNK_SIZE = 65536 // 64KB per request
const BYTES_PER_ROW = 16

function toHex(byte: number): string {
  return byte.toString(16).padStart(2, '0')
}

function toAscii(byte: number): string {
  return byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : '.'
}

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  hex: 'Hex',
  tree: 'Tree',
  table: 'Table',
}

export default function RecordingViewer({ clusterId, nodeId, recordingId, totalSize, initialOffset = 0, initialViewMode = 'hex', onClose, onStateChange }: Props) {
  const [data, setData] = useState<Uint8Array | null>(null)
  const [offset, setOffset] = useState(initialOffset)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode)
  const startOffsetRef = useRef(initialOffset)
  const [showDecoders, setShowDecoders] = useState(false)
  const [decoderVersion, setDecoderVersion] = useState(0)
  const [selectedMessageIndex, setSelectedMessageIndex] = useState(0)

  const registry = useMemo(() => new DecoderRegistry(), [decoderVersion])

  const decodedMessages: DecodedMessage[] = useMemo(() => {
    if (!data) return []
    return decodeChunk(data, offset, registry)
  }, [data, offset, registry])

  const fetchBytes = useCallback((fetchOffset: number) => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({
      offset: String(fetchOffset),
      length: String(CHUNK_SIZE),
    })
    fetch(`/api/clusters/${clusterId}/nodes/${nodeId}/archive/recordings/${recordingId}/bytes?${params}`)
      .then((res) => res.json())
      .then((result) => {
        if (result.success === false) {
          setError(result.error ?? result.message ?? 'Failed to read bytes')
          setData(null)
          return
        }
        // The output field contains JSON with base64 data
        const parsed = typeof result.output === 'string' ? JSON.parse(result.output) : result
        if (parsed.error) {
          setError(parsed.error)
          setData(null)
          return
        }
        const bytes = Uint8Array.from(atob(parsed.data), (c) => c.charCodeAt(0))
        setData(bytes)
        setOffset(fetchOffset)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Network error')
        setData(null)
      })
      .finally(() => setLoading(false))
  }, [clusterId, nodeId, recordingId])

  useEffect(() => {
    fetchBytes(startOffsetRef.current)
  }, [fetchBytes])

  // Report state changes to parent for URL sync
  useEffect(() => {
    onStateChange?.({ offset, viewMode })
  }, [offset, viewMode, onStateChange])

  const handlePrev = () => {
    const newOffset = Math.max(0, offset - CHUNK_SIZE)
    fetchBytes(newOffset)
  }

  const handleNext = () => {
    const hasMore = totalSize > 0
      ? offset + CHUNK_SIZE < totalSize
      : data !== null && data.length === CHUNK_SIZE // unknown size: assume more if we got a full chunk
    if (hasMore) {
      fetchBytes(offset + CHUNK_SIZE)
    }
  }

  const handleCopy = () => {
    if (!data) return
    const lines: string[] = []
    for (let i = 0; i < data.length; i += BYTES_PER_ROW) {
      const row = data.slice(i, i + BYTES_PER_ROW)
      const addr = (offset + i).toString(16).padStart(8, '0')
      const hex = Array.from(row).map(toHex).join(' ')
      const ascii = Array.from(row).map(toAscii).join('')
      lines.push(`${addr}  ${hex.padEnd(BYTES_PER_ROW * 3 - 1)}  ${ascii}`)
    }
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const endOffset = data ? offset + data.length : offset

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] rounded-lg border border-border-medium bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <div className="flex items-center gap-3">
          {!onClose && (
            <Link
              to={`/clusters/${clusterId}/archive`}
              className="text-text-muted hover:text-text-primary transition-colors"
              title="Back to Archive"
            >
              &larr;
            </Link>
          )}
          <h2 className="text-sm font-semibold text-text-primary">
            Recording #{recordingId}
          </h2>
          <span className="text-xs text-text-muted">
            {formatBytes(totalSize)} total
          </span>
          <span className="text-xs text-text-muted">
            Showing {offset.toLocaleString()}&ndash;{endOffset.toLocaleString()}
          </span>
          {decodedMessages.length > 0 && (
            <span className="text-xs text-text-muted">
              {decodedMessages.length} message{decodedMessages.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* View mode tabs */}
          <div className="flex rounded-md border border-border-medium">
            {(['hex', 'tree', 'table'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-2.5 py-1 text-xs font-medium transition-colors first:rounded-l-md last:rounded-r-md ${
                  viewMode === mode
                    ? 'bg-info-fill text-white'
                    : 'text-text-secondary hover:text-text-primary hover:bg-elevated'
                }`}
              >
                {VIEW_MODE_LABELS[mode]}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowDecoders(true)}
            className="rounded px-2 py-1 text-xs font-medium text-text-secondary hover:text-text-primary"
          >
            Decoders
          </button>
          {viewMode === 'hex' && (
            <button
              onClick={handleCopy}
              disabled={!data}
              className="rounded px-2 py-1 text-xs font-medium text-text-secondary hover:text-text-primary disabled:opacity-30"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="rounded px-2 py-1 text-xs font-medium text-text-secondary hover:text-text-primary"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4">
        {loading && (
          <div className="flex items-center justify-center py-12 text-text-muted text-sm">
            Loading bytes...
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-critical-fill/40 bg-critical-surface p-4 text-sm text-critical-text">
            {error}
          </div>
        )}
        {data && !loading && viewMode === 'hex' && (
          <AnnotatedHexView data={data} baseOffset={offset} messages={decodedMessages} />
        )}
        {data && !loading && viewMode === 'tree' && (
          <TreeView messages={decodedMessages} initialSelectedIndex={selectedMessageIndex} />
        )}
        {data && !loading && viewMode === 'table' && (
          <MessageTableView
            messages={decodedMessages}
            onSelectMessage={(i) => { setSelectedMessageIndex(i); setViewMode('tree') }}
          />
        )}
      </div>

      {/* Footer — pagination */}
      <div className="flex items-center justify-between border-t border-border-subtle px-4 py-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => fetchBytes(0)}
            disabled={offset === 0 || loading}
            className="rounded-md bg-elevated px-2 py-1.5 text-xs font-medium text-text-secondary hover:bg-elevated disabled:opacity-30"
          >
            First
          </button>
          <button
            onClick={handlePrev}
            disabled={offset === 0 || loading}
            className="rounded-md bg-elevated px-2 py-1.5 text-xs font-medium text-text-secondary hover:bg-elevated disabled:opacity-30"
          >
            Prev
          </button>
        </div>
        <div className="flex items-center gap-2">
          {(() => {
            const currentPage = Math.floor(offset / CHUNK_SIZE) + 1
            const lastPage = totalSize > 0 ? Math.max(1, Math.ceil(totalSize / CHUNK_SIZE)) : null
            return (
              <form
                className="flex items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault()
                  const input = (e.currentTarget.elements.namedItem('chunkPage') as HTMLInputElement)
                  const v = parseInt(input.value, 10)
                  if (!isNaN(v) && v >= 1 && (lastPage === null || v <= lastPage)) fetchBytes((v - 1) * CHUNK_SIZE)
                  input.value = String(currentPage)
                }}
              >
                <input
                  name="chunkPage"
                  key={offset}
                  defaultValue={currentPage}
                  className="w-12 rounded bg-elevated border border-border-medium px-1.5 py-1 text-xs text-text-primary text-center"
                  onBlur={(e) => {
                    const v = parseInt(e.target.value, 10)
                    if (!isNaN(v) && v >= 1 && (lastPage === null || v <= lastPage)) fetchBytes((v - 1) * CHUNK_SIZE)
                    else e.target.value = String(currentPage)
                  }}
                />
                {lastPage !== null && <span className="text-xs text-text-muted">/ {lastPage}</span>}
              </form>
            )
          })()}
          <span className="text-text-muted text-xs">|</span>
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault()
              const input = (e.currentTarget.elements.namedItem('posInput') as HTMLInputElement)
              const v = parseInt(input.value, 10)
              if (!isNaN(v) && v >= 0 && (totalSize <= 0 || v < totalSize)) {
                fetchBytes(Math.floor(v / CHUNK_SIZE) * CHUNK_SIZE)
              }
              input.value = String(offset)
            }}
          >
            <span className="text-xs text-text-muted">pos</span>
            <input
              name="posInput"
              key={offset}
              defaultValue={offset}
              className="w-24 rounded bg-elevated border border-border-medium px-1.5 py-1 text-xs text-text-primary text-center font-mono"
              onBlur={(e) => {
                const v = parseInt(e.target.value, 10)
                if (!isNaN(v) && v >= 0 && (totalSize <= 0 || v < totalSize)) {
                  fetchBytes(Math.floor(v / CHUNK_SIZE) * CHUNK_SIZE)
                } else {
                  e.target.value = String(offset)
                }
              }}
            />
          </form>
          <span className="text-xs text-text-muted">
            {totalSize > 0 && `${Math.round((endOffset / totalSize) * 100)}%`}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleNext}
            disabled={loading || (totalSize > 0 ? offset + CHUNK_SIZE >= totalSize : data !== null && data.length < CHUNK_SIZE)}
            className="rounded-md bg-elevated px-2 py-1.5 text-xs font-medium text-text-secondary hover:bg-elevated disabled:opacity-30"
          >
            Next
          </button>
          <button
            onClick={() => { if (totalSize > 0) fetchBytes(Math.max(0, Math.ceil(totalSize / CHUNK_SIZE) - 1) * CHUNK_SIZE) }}
            disabled={loading || totalSize <= 0 || offset + CHUNK_SIZE >= totalSize}
            className="rounded-md bg-elevated px-2 py-1.5 text-xs font-medium text-text-secondary hover:bg-elevated disabled:opacity-30"
          >
            Last
          </button>
        </div>
      </div>
      {showDecoders && (
        <DecoderEditor
          registry={registry}
          onClose={() => setShowDecoders(false)}
          onUpdate={() => setDecoderVersion((v) => v + 1)}
          data={data}
          messages={decodedMessages}
        />
      )}
    </div>
  )
}
