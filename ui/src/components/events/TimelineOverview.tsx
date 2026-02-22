import { useRef, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, ReferenceArea, Tooltip } from 'recharts'
import { useEventStore } from '../../stores/eventStore'
import { SEVERITY_FILL } from '../../utils/eventSeverity'

interface ChartMouseState {
  activeLabel?: string
}

function formatTimeLabel(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function TimelineOverview() {
  const histogram = useEventStore((s) => s.histogram)
  const setRangeMode = useEventStore((s) => s.setRangeMode)
  const isLive = useEventStore((s) => s.isLive)

  // Brush selection state
  const [refAreaLeft, setRefAreaLeft] = useState<number | null>(null)
  const [refAreaRight, setRefAreaRight] = useState<number | null>(null)
  const selectingRef = useRef(false)

  if (!histogram || histogram.buckets.length === 0) {
    return <div className="h-10 bg-gray-900 rounded border border-gray-800 flex items-center justify-center text-xs text-gray-600">No events</div>
  }

  const data = histogram.buckets.map((b) => ({
    from: b.from,
    to: b.to,
    error: b.error,
    warning: b.warning,
    info: b.info,
    success: b.success,
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
      const leftBucket = data.find(d => d.from === left) ?? data[0]
      const rightBucket = data.find(d => d.from === right) ?? data[data.length - 1]
      if (leftBucket.from !== rightBucket.from) {
        setRangeMode({ type: 'absolute', from: leftBucket.from, to: rightBucket.to })
      }
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
      </div>
      <div className="h-20 bg-gray-900 rounded border border-gray-800">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
          >
            <XAxis
              dataKey="from"
              tickFormatter={formatTimeLabel}
              tick={{ fontSize: 10, fill: '#6b7280' }}
              axisLine={{ stroke: '#374151' }}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '6px', fontSize: '12px' }}
              labelFormatter={(label) => new Date(label as number).toLocaleString()}
            />
            <Bar dataKey="error" stackId="a" fill={SEVERITY_FILL.error} name="Error" isAnimationActive={false} />
            <Bar dataKey="warning" stackId="a" fill={SEVERITY_FILL.warning} name="Warning" isAnimationActive={false} />
            <Bar dataKey="info" stackId="a" fill={SEVERITY_FILL.info} name="Info" isAnimationActive={false} />
            <Bar dataKey="success" stackId="a" fill={SEVERITY_FILL.success} name="Success" isAnimationActive={false} />
            {refAreaLeft != null && refAreaRight != null && (
              <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill="#ffffff" fillOpacity={0.1} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
