import { useEffect, useRef } from 'react'
import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import { useClusterStore } from '../stores/clusterStore'

export function useWebSocket() {
  const clientRef = useRef<Client | null>(null)
  const { updateNode, updateCluster, addAlert, setConnected } = useClusterStore()

  useEffect(() => {
    const client = new Client({
      webSocketFactory: () => new SockJS('/ws'),
      reconnectDelay: 5000,
      onConnect: () => {
        setConnected(true)

        client.subscribe('/topic/cluster', (message) => {
          updateCluster(JSON.parse(message.body))
        })

        client.subscribe('/topic/alerts', (message) => {
          addAlert(JSON.parse(message.body))
        })

        client.subscribe('/topic/nodes', (message) => {
          updateNode(JSON.parse(message.body))
        })
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
      client.deactivate()
    }
  }, [updateNode, updateCluster, addAlert, setConnected])

  return clientRef
}
