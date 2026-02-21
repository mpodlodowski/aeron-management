import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { useEventStore } from '../../stores/eventStore'
import { fetchHistogram } from '../../api/events'
import { HistogramBucket } from '../../types'

export function TimelineZoomed({ clusterId }: { clusterId: string }) {
  const selectedRange = useEventStore((s) => s.selectedRange)
  const setSelectedRange = useEventStore((s) => s.setSelectedRange)
  const [zoomedBuckets, setZoomedBuckets] = useState<HistogramBucket[]>([])

  useEffect(() => {
    if (!selectedRange) {
      setZoomedBuckets([])
      return
    }
    fetchHistogram(clusterId, selectedRange.from, selectedRange.to, 50)
      .then((h) => setZoomedBuckets(h.buckets))
      .catch(() => setZoomedBuckets([]))
  }, [clusterId, selectedRange])

  if (!selectedRange) return null

  const formatTime = (ms: number) => {
    const d = new Date(ms)
    return d.toLocaleTimeString()
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <span className="text-xs text-gray-500">Selected Range</span>
        <span className="text-xs text-gray-400 font-mono">
          {new Date(selectedRange.from).toLocaleString()} — {new Date(selectedRange.to).toLocaleString()}
        </span>
        <button
          onClick={() => setSelectedRange(null)}
          className="text-xs text-blue-400 hover:text-blue-300 ml-auto"
        >
          Reset
        </button>
      </div>
      {zoomedBuckets.length > 0 && (
        <div className="h-24 bg-gray-900 rounded border border-gray-800">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={zoomedBuckets} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <XAxis dataKey="from" tickFormatter={formatTime} tick={{ fontSize: 10, fill: '#6b7280' }} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '6px', fontSize: '12px' }}
                labelFormatter={(label) => new Date(label as number).toLocaleString()}
              />
              <Bar dataKey="cluster" stackId="a" fill="#ef4444" name="Cluster" isAnimationActive={false} />
              <Bar dataKey="node" stackId="a" fill="#3b82f6" name="Node" isAnimationActive={false} />
              <Bar dataKey="agent" stackId="a" fill="#22c55e" name="Agent" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
