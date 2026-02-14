import { Alert } from '../types'

interface Props {
  alerts: Alert[]
}

export default function EventLog({ alerts }: Props) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
      <h3 className="text-sm font-medium text-gray-400 mb-3">Recent Events</h3>
      {alerts.length === 0 ? (
        <p className="text-sm text-gray-600">No events yet</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {alerts.slice(0, 20).map((alert, i) => (
            <li key={i} className="flex gap-3 text-gray-400">
              <span className="font-mono text-gray-600">
                {new Date(alert.timestamp).toLocaleTimeString()}
              </span>
              <span>
                {alert.type === 'NODE_DISCONNECTED'
                  ? `Node ${alert.nodeId} disconnected`
                  : alert.type}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
