import { useState, useMemo } from 'react'
import { useClusterStore } from '../stores/clusterStore'
import { ArchiveRecording } from '../types'

interface RecordingRow extends ArchiveRecording {
  nodeId: number
}

export default function Archive() {
  const nodes = useClusterStore((s) => s.nodes)
  const [filterNode, setFilterNode] = useState<number | null>(null)

  const allRecordings = useMemo(() => {
    const rows: RecordingRow[] = []
    for (const [nodeId, metrics] of nodes) {
      if (metrics.recordings) {
        for (const rec of metrics.recordings) {
          rows.push({ ...rec, nodeId })
        }
      }
    }
    return rows.sort((a, b) => a.recordingId - b.recordingId)
  }, [nodes])

  const filtered = useMemo(() => {
    if (filterNode === null) return allRecordings
    return allRecordings.filter((r) => r.nodeId === filterNode)
  }, [allRecordings, filterNode])

  const nodeIds = useMemo(
    () => Array.from(nodes.keys()).sort((a, b) => a - b),
    [nodes],
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Archive Recordings</h2>
        <span className="text-sm text-gray-400">
          {filtered.length} recording{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Node Filter Buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterNode(null)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            filterNode === null
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:text-gray-200'
          }`}
        >
          All Nodes
        </button>
        {nodeIds.map((id) => (
          <button
            key={id}
            onClick={() => setFilterNode(id)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filterNode === id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            Node {id}
          </button>
        ))}
      </div>

      {/* Recordings Table */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 border-b border-gray-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Node
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Recording ID
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Stream
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Channel
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Start Pos
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Stop Pos
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No recordings available
                </td>
              </tr>
            ) : (
              filtered.map((rec) => {
                const isActive = rec.stopPosition === -1 || rec.stopTimestamp === 0
                return (
                  <tr key={`${rec.nodeId}-${rec.recordingId}`} className="hover:bg-gray-800/50">
                    <td className="px-4 py-2 text-gray-200">Node {rec.nodeId}</td>
                    <td className="px-4 py-2 font-mono text-gray-200">
                      {rec.recordingId}
                    </td>
                    <td className="px-4 py-2 font-mono text-gray-400">
                      {rec.streamId}
                    </td>
                    <td className="px-4 py-2 text-gray-400 max-w-xs truncate">
                      {rec.channel}
                    </td>
                    <td className="px-4 py-2 font-mono text-gray-400">
                      {rec.startPosition.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 font-mono text-gray-400">
                      {isActive ? '\u2014' : rec.stopPosition.toLocaleString()}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          isActive
                            ? 'bg-green-900/50 text-green-300'
                            : 'bg-gray-700 text-gray-300'
                        }`}
                      >
                        {isActive ? 'ACTIVE' : 'STOPPED'}
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
