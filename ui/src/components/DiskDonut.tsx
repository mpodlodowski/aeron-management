import { DiskGrowthStats } from '../types'
import { diskUsageColor, diskOtherCssColor, ttfColor } from '../utils/statusColors'
import { formatBytes, formatDuration, formatGrowthRate } from '../utils/counters'

interface Props {
  label: string
  recordings: number
  used: number
  total: number
  growth?: DiskGrowthStats
  compact?: boolean
  className?: string
}

const SIZE = 52
const STROKE = 6
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const COMPACT_SIZE = 38
const COMPACT_STROKE = 4
const COMPACT_RADIUS = (COMPACT_SIZE - COMPACT_STROKE) / 2
const COMPACT_CIRCUMFERENCE = 2 * Math.PI * COMPACT_RADIUS

function Ring({ size, stroke, radius, circumference, usedPct, recPct, otherPct }: {
  size: number; stroke: number; radius: number; circumference: number
  usedPct: number; recPct: number; otherPct: number
}) {
  const recLen = (recPct / 100) * circumference
  const otherLen = (otherPct / 100) * circumference
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--elevated)" strokeWidth={stroke} />
        {otherPct > 0 && (
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={diskOtherCssColor(usedPct)} strokeWidth={stroke} strokeDasharray={`${recLen + otherLen} ${circumference}`} />
        )}
        {recPct > 0 && (
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--bar-recordings)" strokeWidth={stroke} strokeDasharray={`${recLen} ${circumference}`} />
        )}
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-[9px] font-mono font-bold ${diskUsageColor(usedPct)}`}>
        {usedPct}%
      </span>
    </div>
  )
}

export function DiskDonut({ label, recordings, used, total, growth, compact, className }: Props) {
  const usedPct = total > 0 ? Math.round((used / total) * 100) : 0
  const recPct = total > 0 ? (recordings / total) * 100 : 0
  const otherPct = total > 0 ? (Math.max(0, used - recordings) / total) * 100 : 0
  const rate = growth?.growthRate1h ?? growth?.growthRate5m ?? null
  const ttf = growth?.timeToFullSeconds ?? null

  if (compact) {
    return (
      <div className={`rounded-lg border border-border-subtle bg-surface px-3 py-2 ${className ?? ''}`}>
        <div className="flex items-center gap-2">
          <Ring size={COMPACT_SIZE} stroke={COMPACT_STROKE} radius={COMPACT_RADIUS} circumference={COMPACT_CIRCUMFERENCE}
            usedPct={usedPct} recPct={recPct} otherPct={otherPct} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary truncate">{label}</span>
              {rate !== null && rate !== 0 && (
                <span className="text-[10px] shrink-0 text-text-muted">{formatGrowthRate(rate)}</span>
              )}
            </div>
            <div className="flex items-center justify-between text-[10px] text-text-secondary mt-0.5">
              <div className="flex flex-wrap gap-x-2 gap-y-0">
                {recordings > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-bar-recordings" />
                    Rec {formatBytes(recordings)}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-bar-other" />
                  {recordings > 0 ? 'Other' : 'Used'} {formatBytes(recordings > 0 ? Math.max(0, used - recordings) : used)}
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-elevated" />
                  Free {formatBytes(total - used)}
                </span>
              </div>
              {ttf !== null && (
                <span className={`shrink-0 ${ttfColor(ttf)}`}>
                  Full in {formatDuration(ttf)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const recLen = (recPct / 100) * CIRCUMFERENCE
  const otherLen = (otherPct / 100) * CIRCUMFERENCE

  return (
    <div className={`rounded-lg border border-border-subtle bg-surface p-3 flex-1 min-w-[200px] max-w-[280px] ${className ?? ''}`}>
      <div className="flex items-center gap-2.5">
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE} className="-rotate-90">
            <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--elevated)" strokeWidth={STROKE} />
            {otherPct > 0 && (
              <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke={diskOtherCssColor(usedPct)} strokeWidth={STROKE}
                strokeDasharray={`${recLen + otherLen} ${CIRCUMFERENCE}`} strokeLinecap="round" />
            )}
            {recPct > 0 && (
              <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--bar-recordings)" strokeWidth={STROKE}
                strokeDasharray={`${recLen} ${CIRCUMFERENCE}`} strokeLinecap="round" />
            )}
          </svg>
          <span className={`absolute inset-0 flex items-center justify-center text-[10px] font-mono font-medium ${diskUsageColor(usedPct)}`}>
            {usedPct}%
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary truncate">{label}</span>
            {rate !== null && rate !== 0 && (
              <span className="text-[10px] shrink-0 text-text-muted">{formatGrowthRate(rate)}</span>
            )}
          </div>
          <div className="flex items-center justify-between text-[10px] text-text-muted mt-0.5">
            <div className="flex flex-wrap gap-x-2.5 gap-y-0">
              {recordings > 0 && (
                <span className="flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-bar-recordings" />
                  Rec {formatBytes(recordings)}
                </span>
              )}
              <span className="flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-bar-other" />
                {recordings > 0 ? 'Other' : 'Used'} {formatBytes(recordings > 0 ? Math.max(0, used - recordings) : used)}
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-elevated" />
                Free {formatBytes(total - used)}
              </span>
            </div>
            {ttf !== null && (
              <span className={`shrink-0 ${ttfColor(ttf)}`}>
                Full in {formatDuration(ttf)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
