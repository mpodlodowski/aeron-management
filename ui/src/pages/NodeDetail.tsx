import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useClusterStore } from '../stores/clusterStore'
import CounterTable from '../components/CounterTable'

interface ActionResult {
  action: string
  success: boolean
  message: string
}

export default function NodeDetail() {
  const { nodeId } = useParams<{ nodeId: string }>()
  const id = Number(nodeId)
  const nodes = useClusterStore((s) => s.nodes)
  const metrics = nodes.get(id)
  const [actionResult, setActionResult] = useState<ActionResult | null>(null)
  const [loading, setLoading] = useState<string | null>(null)

  async function executeAction(action: string) {
    setLoading(action)
    setActionResult(null)
    try {
      const res = await fetch(`/api/nodes/${id}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      setActionResult({
        action,
        success: res.ok,
        message: data.message ?? (res.ok ? 'Action completed' : 'Action failed'),
      })
    } catch (err) {
      setActionResult({
        action,
        success: false,
        message: err instanceof Error ? err.message : 'Network error',
      })
    } finally {
      setLoading(null)
    }
  }

  if (!metrics) {
    return (
      <div className="space-y-4">
        <Link to="/" className="text-sm text-blue-400 hover:text-blue-300">
          &larr; Back to Dashboard
        </Link>
        <div className="text-gray-500">
          No data available for Node {id}. Waiting for metrics...
        </div>
      </div>
    )
  }

  const { clusterMetrics, systemMetrics, counters } = metrics
  const heapPercent = systemMetrics
    ? Math.round((systemMetrics.heapUsedBytes / systemMetrics.heapMaxBytes) * 100)
    : 0

  const actions = [
    { id: 'SNAPSHOT', label: 'Snapshot', color: 'bg-blue-600 hover:bg-blue-500' },
    { id: 'SUSPEND', label: 'Suspend', color: 'bg-yellow-600 hover:bg-yellow-500' },
    { id: 'RESUME', label: 'Resume', color: 'bg-green-600 hover:bg-green-500' },
    { id: 'STEP_DOWN', label: 'Step Down', color: 'bg-red-600 hover:bg-red-500' },
  ]

  return (
    <div className="space-y-6">
      <Link to="/" className="text-sm text-blue-400 hover:text-blue-300">
        &larr; Back to Dashboard
      </Link>

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">
          Node {id}
          <span className="ml-3 text-sm font-normal text-gray-400">
            {clusterMetrics?.nodeRole ?? 'UNKNOWN'}
          </span>
        </h2>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          label="Commit Position"
          value={clusterMetrics?.commitPosition?.toLocaleString() ?? '\u2014'}
        />
        <SummaryCard
          label="Log Position"
          value={clusterMetrics?.logPosition?.toLocaleString() ?? '\u2014'}
        />
        <SummaryCard
          label="Connected Clients"
          value={String(clusterMetrics?.connectedClientCount ?? 0)}
        />
        <SummaryCard
          label="Heap Usage"
          value={`${heapPercent}%`}
        />
      </div>

      {/* Admin Actions */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Admin Actions</h3>
        <div className="flex flex-wrap gap-3">
          {actions.map((action) => (
            <button
              key={action.id}
              onClick={() => executeAction(action.id)}
              disabled={loading !== null}
              className={`rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${action.color}`}
            >
              {loading === action.id ? 'Processing...' : action.label}
            </button>
          ))}
        </div>
        {actionResult && (
          <div
            className={`mt-3 rounded-md px-4 py-2 text-sm ${
              actionResult.success
                ? 'bg-green-900/50 text-green-300 border border-green-800'
                : 'bg-red-900/50 text-red-300 border border-red-800'
            }`}
          >
            <span className="font-medium">{actionResult.action}:</span>{' '}
            {actionResult.message}
          </div>
        )}
      </div>

      {/* Counters Table */}
      <div>
        <h3 className="text-sm font-medium text-gray-400 mb-3">
          Aeron Counters ({counters?.length ?? 0})
        </h3>
        <CounterTable counters={counters ?? []} />
      </div>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className="text-lg font-mono text-gray-200">{value}</div>
    </div>
  )
}
