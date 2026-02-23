/** Role status dot color (Tailwind class for bg-*) */
export function roleDotColor(role: string): string {
  switch (role) {
    case 'LEADER': return 'bg-success-text'
    case 'FOLLOWER': return 'bg-info-text'
    case 'CANDIDATE': return 'bg-warning-text'
    case 'BACKUP': return 'bg-role-backup'
    case 'DOWN': return 'bg-critical-text'
    case 'OFFLINE': return 'bg-text-muted'
    case 'DETACHED': return 'bg-warning-text'
    default: return 'bg-text-muted'
  }
}

/** Node card border class based on connectivity state */
export function nodeBorderClass(agentDown: boolean, noCnc: boolean, nodeDown: boolean): string {
  if (agentDown) return 'border-border-subtle bg-surface opacity-75'
  if (noCnc) return 'border-warning-fill/40 bg-warning-surface'
  if (nodeDown) return 'border-critical-fill/40 bg-critical-surface'
  return 'border-border-subtle bg-surface hover:border-border-medium'
}

/** Disk usage text color based on percentage */
export function diskUsageColor(pct: number): string {
  if (pct > 95) return 'text-critical-text'
  if (pct > 90) return 'text-warning-text'
  return 'text-text-secondary'
}

/** Disk usage bar segment color */
export function diskBarColor(pct: number): string {
  if (pct > 90) return 'bg-critical-fill'
  if (pct > 75) return 'bg-warning-fill'
  return 'bg-border-medium'
}

/** Time-to-full color based on urgency */
export function ttfColor(seconds: number): string {
  if (seconds < 3600) return 'text-critical-text'
  if (seconds < 86400) return 'text-warning-text'
  return 'text-text-muted'
}
