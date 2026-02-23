import { useParams } from 'react-router-dom'
import { useWebSocket } from '../hooks/useWebSocket'
import { EventsTimeline } from '../components/events/EventsTimeline'

export default function Events() {
  const { clusterId } = useParams<{ clusterId: string }>()
  useWebSocket(clusterId)

  if (!clusterId) return null

  return <EventsTimeline clusterId={clusterId} />
}
