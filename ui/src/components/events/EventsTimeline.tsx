import { useEffect } from 'react'
import { useEventStore } from '../../stores/eventStore'
import { useClusterStore } from '../../stores/clusterStore'
import { TimelineOverview } from './TimelineOverview'
import { TimelineZoomed } from './TimelineZoomed'
import { EventList } from './EventList'
import { EventFilters } from './EventFilters'

export function EventsTimeline({ clusterId }: { clusterId: string }) {
  const cluster = useClusterStore((s) => s.clusters.get(clusterId))
  const setFullRange = useEventStore((s) => s.setFullRange)
  const loadEvents = useEventStore((s) => s.loadEvents)
  const loadHistogram = useEventStore((s) => s.loadHistogram)
  const reset = useEventStore((s) => s.reset)
  const selectedRange = useEventStore((s) => s.selectedRange)
  const fullRange = useEventStore((s) => s.fullRange)

  // Set full range from cluster start to now
  useEffect(() => {
    const clusterStartMs = cluster?.clusterStats?.clusterStartMs
    if (clusterStartMs && clusterStartMs > 0) {
      setFullRange({ from: clusterStartMs, to: Date.now() })
    }
  }, [cluster?.clusterStats?.clusterStartMs, setFullRange])

  // Load events and histogram when range or filters change
  useEffect(() => {
    if (fullRange) {
      loadEvents(clusterId)
      loadHistogram(clusterId)
    }
  }, [clusterId, fullRange, selectedRange, loadEvents, loadHistogram])

  // Periodically update full range right bound (keep it "live")
  useEffect(() => {
    const interval = setInterval(() => {
      const store = useEventStore.getState()
      if (store.isLive && store.fullRange) {
        setFullRange({ from: store.fullRange.from, to: Date.now() })
      }
    }, 10000) // every 10s
    return () => clearInterval(interval)
  }, [setFullRange])

  // Reset on unmount
  useEffect(() => {
    return () => reset()
  }, [clusterId, reset])

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-4">
      <EventFilters clusterId={clusterId} />
      <TimelineOverview />
      <TimelineZoomed clusterId={clusterId} />
      <EventList clusterId={clusterId} />
    </div>
  )
}
