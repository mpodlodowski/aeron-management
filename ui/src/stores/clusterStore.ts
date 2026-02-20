import { create } from 'zustand'
import { MetricsReport, ClusterOverview, ClusterStats, Alert, ClusterSummary } from '../types'

interface SingleClusterState {
  nodes: Map<number, MetricsReport>
  leaderNodeId: number | null
  clusterState: string | null
  clusterStats: ClusterStats | null
  alerts: Alert[]
}

interface ClusterStore {
  clusterList: ClusterSummary[]
  clusters: Map<string, SingleClusterState>
  connected: boolean

  setClusterList: (list: ClusterSummary[]) => void
  updateClusterOverview: (clusterId: string, overview: ClusterOverview) => void
  updateNode: (clusterId: string, metrics: MetricsReport) => void
  addAlert: (clusterId: string, alert: Alert) => void
  setAlerts: (clusterId: string, alerts: Alert[]) => void
  setConnected: (connected: boolean) => void
}

function emptyCluster(): SingleClusterState {
  return { nodes: new Map(), leaderNodeId: null, clusterState: null, clusterStats: null, alerts: [] }
}

export const useClusterStore = create<ClusterStore>((set) => ({
  clusterList: [],
  clusters: new Map(),
  connected: false,

  setClusterList: (list) => set({ clusterList: list }),

  updateClusterOverview: (clusterId, overview) =>
    set((state) => {
      const clusters = new Map(state.clusters)
      const nodes = new Map<number, MetricsReport>()
      for (const [key, value] of Object.entries(overview.nodes)) {
        nodes.set(Number(key), value)
      }
      clusters.set(clusterId, {
        ...(clusters.get(clusterId) ?? emptyCluster()),
        nodes,
        leaderNodeId: overview.leaderNodeId ?? null,
        clusterState: overview.clusterState ?? null,
        clusterStats: overview.clusterStats ?? null,
      })
      return { clusters }
    }),

  updateNode: (clusterId, metrics) =>
    set((state) => {
      const clusters = new Map(state.clusters)
      const cluster = clusters.get(clusterId) ?? emptyCluster()
      const nodes = new Map(cluster.nodes)
      nodes.set(metrics.nodeId, metrics)
      clusters.set(clusterId, { ...cluster, nodes })
      return { clusters }
    }),

  addAlert: (clusterId, alert) =>
    set((state) => {
      const clusters = new Map(state.clusters)
      const cluster = clusters.get(clusterId) ?? emptyCluster()
      clusters.set(clusterId, {
        ...cluster,
        alerts: [alert, ...cluster.alerts].slice(0, 200),
      })
      return { clusters }
    }),

  setAlerts: (clusterId, alerts) =>
    set((state) => {
      const clusters = new Map(state.clusters)
      const cluster = clusters.get(clusterId) ?? emptyCluster()
      clusters.set(clusterId, { ...cluster, alerts })
      return { clusters }
    }),

  setConnected: (connected) => set({ connected }),
}))
