import { useCallback, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useWebSocket } from '../hooks/useWebSocket'
import RecordingViewer from '../components/RecordingViewer'
import type { ViewMode } from '../lib/decoder'

export default function RecordingDetail() {
  const { clusterId, nodeId, recordingId } = useParams<{
    clusterId: string
    nodeId: string
    recordingId: string
  }>()
  useWebSocket(clusterId)
  const [searchParams, setSearchParams] = useSearchParams()
  const offset = Number(searchParams.get('offset') ?? '0')
  const rawMode = searchParams.get('mode')
  const viewMode: ViewMode = rawMode === 'tree' || rawMode === 'table' ? rawMode : 'hex'

  const [totalSize, setTotalSize] = useState(0)
  const [sizeLoaded, setSizeLoaded] = useState(false)

  // Fetch recording metadata to get totalSize
  useEffect(() => {
    if (!clusterId || !nodeId || !recordingId) return
    fetch(`/api/clusters/${clusterId}/nodes/${Number(nodeId)}/archive/recordings/${Number(recordingId)}/describe`, { method: 'GET' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (data.output) {
          const parsed = typeof data.output === 'string' ? JSON.parse(data.output) : data.output
          const stop = parsed.stopPosition ?? 0
          const start = parsed.startPosition ?? 0
          setTotalSize(stop > start ? stop - start : 0)
        }
        setSizeLoaded(true)
      })
      .catch((err) => {
        console.warn('Failed to fetch recording metadata:', err)
        setSizeLoaded(true)
      })
  }, [clusterId, nodeId, recordingId])

  const handleStateChange = useCallback((state: { offset: number; viewMode: ViewMode }) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (state.offset > 0) next.set('offset', String(state.offset))
      else next.delete('offset')
      if (state.viewMode !== 'hex') next.set('mode', state.viewMode)
      else next.delete('mode')
      return next
    }, { replace: true })
  }, [setSearchParams])

  if (!clusterId || !nodeId || !recordingId) {
    return <div className="text-text-muted">Invalid recording URL.</div>
  }

  if (!sizeLoaded) {
    return <div className="text-text-muted">Loading recording...</div>
  }

  return (
    <RecordingViewer
      clusterId={clusterId}
      nodeId={Number(nodeId)}
      recordingId={Number(recordingId)}
      totalSize={totalSize}
      initialOffset={offset}
      initialViewMode={viewMode}
      onStateChange={handleStateChange}
    />
  )
}
