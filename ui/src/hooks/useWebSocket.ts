import { useEffect, useRef } from 'react'
import { Client, StompSubscription } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import { useClusterStore } from '../stores/clusterStore'
import { useEventStore } from '../stores/eventStore'

export function useWebSocket(clusterId: string | undefined) {
  const clientRef = useRef<Client | null>(null)
  const subsRef = useRef<StompSubscription[]>([])
  const { setClusterList, updateClusterOverview, updateNode, setConnected } = useClusterStore()

  useEffect(() => {
    const client = new Client({
      webSocketFactory: () => new SockJS('/ws'),
      reconnectDelay: 5000,
      onConnect: () => {
        setConnected(true)

        const clusterListSub = client.subscribe('/topic/clusters', (message) => {
          setClusterList(JSON.parse(message.body))
        })
        subsRef.current = [clusterListSub]

        if (clusterId) {
          const clusterSub = client.subscribe(`/topic/clusters/${clusterId}/cluster`, (message) => {
            updateClusterOverview(clusterId, JSON.parse(message.body))
          })
          const eventSub = client.subscribe(`/topic/clusters/${clusterId}/events`, (message) => {
            useEventStore.getState().addRealtimeEvent(JSON.parse(message.body))
          })
          const nodesSub = client.subscribe(`/topic/clusters/${clusterId}/nodes`, (message) => {
            updateNode(clusterId, JSON.parse(message.body))
          })
          subsRef.current.push(clusterSub, eventSub, nodesSub)
        }
      },
      onDisconnect: () => setConnected(false),
      onStompError: (frame) => {
        console.error('STOMP error:', frame)
        setConnected(false)
      },
    })

    client.activate()
    clientRef.current = client

    return () => {
      subsRef.current.forEach(sub => sub.unsubscribe())
      subsRef.current = []
      client.deactivate()
    }
  }, [clusterId, setClusterList, updateClusterOverview, updateNode, setConnected])

  return clientRef
}
