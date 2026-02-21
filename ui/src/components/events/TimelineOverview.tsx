import { useRef, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, ReferenceArea } from 'recharts'
import { useEventStore } from '../../stores/eventStore'

interface ChartMouseState {
  activeLabel?: string
}

export function TimelineOverview() {
  const histogram = useEventStore((s) => s.histogram)
  const selectedRange = useEventStore((s) => s.selectedRange)
  const setSelectedRange = useEventStore((s) => s.setSelectedRange)
  const isLive = useEventStore((s) => s.isLive)

  // Brush selection state
  const [refAreaLeft, setRefAreaLeft] = useState<number | null>(null)
  const [refAreaRight, setRefAreaRight] = useState<number | null>(null)
  const selectingRef = useRef(false)

  if (!histogram || histogram.buckets.length === 0) {
    return <div className="h-16 bg-gray-900 rounded border border-gray-800 flex items-center justify-center text-xs text-gray-600">No events</div>
  }

  const data = histogram.buckets.map((b) => ({
    from: b.from,
    to: b.to,
    cluster: b.cluster,
    node: b.node,
    agent: b.agent,
  }))

  const handleMouseDown = (state: ChartMouseState) => {
    if (state?.activeLabel != null) {
      setRefAreaLeft(Number(state.activeLabel))
      selectingRef.current = true
    }
  }

  const handleMouseMove = (state: ChartMouseState) => {
    if (selectingRef.current && state?.activeLabel != null) {
      setRefAreaRight(Number(state.activeLabel))
    }
  }

  const handleMouseUp = () => {
    if (refAreaLeft != null && refAreaRight != null) {
      const [left, right] = [refAreaLeft, refAreaRight].sort((a, b) => a - b)
      // Find matching buckets
      const leftBucket = data.find(d => d.from === left) ?? data[0]
      const rightBucket = data.find(d => d.from === right) ?? data[data.length - 1]
      setSelectedRange({ from: leftBucket.from, to: rightBucket.to })
    }
    setRefAreaLeft(null)
    setRefAreaRight(null)
    selectingRef.current = false
  }

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500">
          Overview
          {isLive && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-green-500" />}
        </span>
        {selectedRange && (
          <button
            onClick={() => setSelectedRange(null)}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Reset to live
          </button>
        )}
      </div>
      <div className="h-16 bg-gray-900 rounded border border-gray-800">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            margin={{ top: 2, right: 2, bottom: 0, left: 2 }}
          >
            <XAxis dataKey="from" hide />
            <YAxis hide />
            <Bar dataKey="cluster" stackId="a" fill="#ef4444" isAnimationActive={false} />
            <Bar dataKey="node" stackId="a" fill="#3b82f6" isAnimationActive={false} />
            <Bar dataKey="agent" stackId="a" fill="#22c55e" isAnimationActive={false} />
            {refAreaLeft != null && refAreaRight != null && (
              <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill="#ffffff" fillOpacity={0.1} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
