import type { DecodedMessage } from '../../lib/decoder/types'

interface Props {
  messages: DecodedMessage[]
  onSelectMessage?: (index: number) => void
}

function formatOffset(offset: number): string {
  return '0x' + offset.toString(16).padStart(8, '0')
}

function keyFields(msg: DecodedMessage): string {
  const payload = msg.fields.filter((f) => f.layer === 'payload' || f.layer === 'nested-sbe')
  if (payload.length === 0) return '\u2014'
  return payload
    .slice(0, 3)
    .map((f) => `${f.name}=${String(f.value)}`)
    .join(', ')
}

export default function MessageTableView({ messages, onSelectMessage }: Props) {
  if (messages.length === 0) {
    return (
      <div className="text-sm text-text-muted py-8 text-center">
        No messages decoded in this chunk
      </div>
    )
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border-subtle text-left text-text-muted uppercase tracking-wider">
            <th className="px-3 py-2 w-8">#</th>
            <th className="px-3 py-2">Offset</th>
            <th className="px-3 py-2">Label</th>
            <th className="px-3 py-2">Schema</th>
            <th className="px-3 py-2">Template</th>
            <th className="px-3 py-2">Size</th>
            <th className="px-3 py-2">Key Fields</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle/50">
          {messages.map((msg, i) => (
            <tr
              key={i}
              onClick={() => onSelectMessage?.(i)}
              className="hover:bg-elevated/50 cursor-pointer transition-colors"
            >
              <td className="px-3 py-1.5 text-text-muted">{i + 1}</td>
              <td className="px-3 py-1.5 font-mono text-info-text">{formatOffset(msg.offset)}</td>
              <td className="px-3 py-1.5 text-text-primary">{msg.label}</td>
              <td className="px-3 py-1.5 font-mono text-text-secondary">{msg.schemaId ?? '\u2014'}</td>
              <td className="px-3 py-1.5 font-mono text-text-secondary">{msg.templateId ?? '\u2014'}</td>
              <td className="px-3 py-1.5 font-mono text-text-secondary">{msg.frameLength}</td>
              <td className="px-3 py-1.5 text-text-secondary max-w-xs truncate">{keyFields(msg)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
