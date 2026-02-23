interface Props {
  clusterState: string | null
  downNodes: number[]
  onResume?: () => void
}

export function StatusBanner({ clusterState, downNodes, onResume }: Props) {
  if (clusterState === 'SUSPENDED') {
    return (
      <div className="border-l-4 border-warning-fill bg-warning-surface px-4 py-2.5 flex items-center gap-3">
        <span className="text-sm text-warning-text font-medium">Cluster is suspended</span>
        <span className="text-sm text-text-secondary">Log processing is paused. Resume to accept new commands.</span>
        {onResume && (
          <button
            onClick={onResume}
            className="ml-auto rounded border border-border-medium px-3 py-1 text-xs text-text-primary hover:bg-elevated transition-colors"
          >
            Resume
          </button>
        )}
      </div>
    )
  }

  if (clusterState === 'SNAPSHOT') {
    return (
      <div className="border-l-4 border-info-fill bg-info-surface px-4 py-2.5 flex items-center gap-3">
        <span className="text-sm text-info-text font-medium">Snapshot in progress</span>
        <span className="text-sm text-text-secondary">Cluster is taking a snapshot for log compaction.</span>
      </div>
    )
  }

  if (downNodes.length > 0) {
    const label = downNodes.length === 1
      ? `Node ${downNodes[0]} is unreachable`
      : `${downNodes.length} nodes are unreachable (${downNodes.join(', ')})`
    return (
      <div className="border-l-4 border-critical-fill bg-critical-surface px-4 py-2.5 flex items-center gap-3">
        <span className="text-sm text-critical-text font-medium">{label}</span>
      </div>
    )
  }

  return null
}
