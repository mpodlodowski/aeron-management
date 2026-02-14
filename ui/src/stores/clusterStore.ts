import { create } from 'zustand'
import { MetricsReport, ClusterOverview, ClusterStats, Alert } from '../types'

interface ClusterState {
  nodes: Map<number, MetricsReport>
  leaderNodeId: number | null
  clusterStats: ClusterStats | null
  alerts: Alert[]
  connected: boolean

  updateNode: (metrics: MetricsReport) => void
  updateCluster: (overview: ClusterOverview) => void
  addAlert: (alert: Alert) => void
  setAlerts: (alerts: Alert[]) => void
  setConnected: (connected: boolean) => void
}

export const useClusterStore = create<ClusterState>((set) => ({
  nodes: new Map(),
  leaderNodeId: null,
  clusterStats: null,
  alerts: [],
  connected: false,

  updateNode: (metrics) =>
    set((state) => {
      const nodes = new Map(state.nodes)
      nodes.set(metrics.nodeId, metrics)
      return { nodes }
    }),

  updateCluster: (overview) =>
    set(() => {
      const nodes = new Map<number, MetricsReport>()
      for (const [key, value] of Object.entries(overview.nodes)) {
        nodes.set(Number(key), value)
      }
      return {
        nodes,
        leaderNodeId: overview.leaderNodeId ?? null,
        clusterStats: overview.clusterStats ?? null,
      }
    }),

  addAlert: (alert) =>
    set((state) => ({
      alerts: [alert, ...state.alerts].slice(0, 200),
    })),

  setAlerts: (alerts) => set({ alerts }),

  setConnected: (connected) => set({ connected }),
}))
