import { useState, useMemo } from 'react'
import { AeronCounter } from '../types'

/** Epoch ms range ~2001–2096 */
function isEpochMs(v: number): boolean {
  return v > 1_000_000_000_000 && v < 4_100_000_000_000
}

interface Props {
  counters: AeronCounter[]
}

type SortField = 'counterId' | 'label' | 'value' | 'typeId'
type SortDir = 'asc' | 'desc'

export default function CounterTable({ counters }: Props) {
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('counterId')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const filtered = useMemo(() => {
    const term = search.toLowerCase()
    return counters.filter((c) => c.label.toLowerCase().includes(term))
  }, [counters, search])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aVal = a[sortField]
      const bVal = b[sortField]
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal)
      }
      const diff = (aVal as number) - (bVal as number)
      return sortDir === 'asc' ? diff : -diff
    })
  }, [filtered, sortField, sortDir])

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  function headerClass(field: SortField) {
    return `cursor-pointer select-none px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hover:text-gray-200 ${
      sortField === field ? 'text-gray-200' : ''
    }`
  }

  function sortIndicator(field: SortField) {
    if (sortField !== field) return ''
    return sortDir === 'asc' ? ' \u2191' : ' \u2193'
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900">
      <div className="p-4 border-b border-gray-800">
        <input
          type="text"
          placeholder="Search counters..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />
      </div>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-900 border-b border-gray-800">
            <tr>
              <th className={headerClass('counterId')} onClick={() => toggleSort('counterId')}>
                ID{sortIndicator('counterId')}
              </th>
              <th className={headerClass('label')} onClick={() => toggleSort('label')}>
                Label{sortIndicator('label')}
              </th>
              <th className={headerClass('value')} onClick={() => toggleSort('value')}>
                Value{sortIndicator('value')}
              </th>
              <th className={headerClass('typeId')} onClick={() => toggleSort('typeId')}>
                Type ID{sortIndicator('typeId')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                  {search ? 'No counters match your search' : 'No counters available'}
                </td>
              </tr>
            ) : (
              sorted.map((counter) => {
                const tsTooltip = isEpochMs(counter.value)
                  ? new Date(counter.value).toLocaleString()
                  : undefined
                return (
                  <tr key={counter.counterId} className="hover:bg-gray-800/50">
                    <td className="px-4 py-2 font-mono text-gray-400">
                      {counter.counterId}
                    </td>
                    <td className="px-4 py-2 text-gray-200">{counter.label}</td>
                    <td
                      className={`px-4 py-2 font-mono text-gray-200${tsTooltip ? ' cursor-help underline decoration-dotted decoration-gray-600' : ''}`}
                      title={tsTooltip}
                    >
                      {counter.value.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 font-mono text-gray-400">
                      {counter.typeId}
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
