import { Alert } from '../types'

interface Props {
  alerts: Alert[]
}

const EVENT_STYLES: Record<string, { dot: string; label: string }> = {
  AGENT_CONNECTED:    { dot: 'bg-green-500', label: 'Connected' },
  AGENT_DISCONNECTED: { dot: 'bg-red-500',   label: 'Disconnected' },
  ROLE_CHANGE:        { dot: 'bg-blue-500',  label: 'Role Change' },
  LEADER_CHANGE:      { dot: 'bg-yellow-500', label: 'Leader Change' },
  ELECTION_STARTED:   { dot: 'bg-yellow-500', label: 'Election' },
}

export default function EventLog({ alerts }: Props) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
      <h3 className="text-sm font-medium text-gray-400 mb-3">Recent Events</h3>
      {alerts.length === 0 ? (
        <p className="text-sm text-gray-600">No events yet</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {alerts.slice(0, 50).map((alert, i) => {
            const style = EVENT_STYLES[alert.type] ?? { dot: 'bg-gray-500', label: alert.type }
            return (
              <li key={i} className="flex items-start gap-3 text-gray-400">
                <span className="font-mono text-gray-600 shrink-0">
                  {new Date(alert.timestamp).toLocaleTimeString()}
                </span>
                <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${style.dot}`} />
                <span>
                  <span className="text-gray-300 font-medium">Node {alert.nodeId}</span>
                  {' '}
                  {alert.message ?? style.label}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
