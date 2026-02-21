import { useState } from 'react'
import type { DecodedMessage, DecodedField } from '../../lib/decoder/types'

interface Props {
  messages: DecodedMessage[]
  initialSelectedIndex?: number
}

interface FieldGroup {
  title: string
  fields: DecodedField[]
}

function formatValue(value: string | number | bigint | boolean): string {
  if (typeof value === 'bigint') return value.toString()
  return String(value)
}

function buildGroups(msg: DecodedMessage): FieldGroup[] {
  const groups: FieldGroup[] = []

  const frameFields = msg.fields.filter((f) => f.layer === 'frame')
  if (frameFields.length > 0) {
    groups.push({ title: 'Frame Header', fields: frameFields })
  }

  const sbeFields = msg.fields.filter((f) => f.layer === 'sbe')
  if (sbeFields.length > 0) {
    groups.push({ title: 'SBE Header', fields: sbeFields })
  }

  const payloadFields = msg.fields.filter((f) => f.layer === 'payload')
  if (payloadFields.length > 0) {
    groups.push({ title: `Payload \u2014 ${msg.label}`, fields: payloadFields })
  } else if (sbeFields.length > 0) {
    // SBE header present but no payload decoder
    groups.push({
      title: `Payload \u2014 ${msg.label}`,
      fields: [],
    })
  }

  const nestedFields = msg.fields.filter((f) => f.layer === 'nested-sbe')
  if (nestedFields.length > 0) {
    const nestedLabel = msg.label.includes(' > ') ? msg.label.split(' > ')[1] : 'Application Payload'
    groups.push({ title: nestedLabel, fields: nestedFields })
  }

  return groups
}

function CollapsibleGroup({ group, schemaId, templateId }: {
  group: FieldGroup
  schemaId?: number
  templateId?: number
}) {
  const [open, setOpen] = useState(true)

  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-gray-200 py-1"
      >
        <span className="w-3 text-center">{open ? '\u25BC' : '\u25B6'}</span>
        {group.title}
      </button>
      {open && (
        <div className="ml-4 mt-1 space-y-0.5">
          {group.fields.length > 0 ? (
            group.fields.map((field, i) => (
              <div key={i} className="flex items-baseline gap-2 text-xs font-mono">
                <span className="text-gray-500 min-w-[120px] shrink-0">{field.name}</span>
                <span className="text-gray-200">{formatValue(field.value)}</span>
                <span className="text-gray-600 text-[10px]">
                  {field.type} ({field.size}B)
                </span>
              </div>
            ))
          ) : (
            <div className="text-xs text-gray-500 italic">
              No payload decoder registered for schema {schemaId ?? '?'} / template {templateId ?? '?'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function TreeView({ messages, initialSelectedIndex }: Props) {
  const [selectedIndex, setSelectedIndex] = useState(initialSelectedIndex ?? 0)

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500 text-sm">
        No messages decoded in this chunk
      </div>
    )
  }

  const selected = messages[selectedIndex]
  const groups = buildGroups(selected)

  return (
    <div className="flex h-full min-h-[300px]">
      {/* Left panel: message list */}
      <div className="w-72 shrink-0 overflow-y-auto border-r border-gray-800 pr-2">
        {messages.map((msg, i) => (
          <button
            key={i}
            onClick={() => setSelectedIndex(i)}
            className={`w-full text-left px-2 py-1.5 text-xs font-mono rounded transition-colors ${
              i === selectedIndex
                ? 'bg-gray-800 text-gray-200'
                : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-300'
            }`}
          >
            <span className="text-gray-600">[{i + 1}]</span>{' '}
            <span className="text-blue-400">0x{msg.offset.toString(16).padStart(8, '0')}</span>{' '}
            <span>{msg.label}</span>
            {msg.schemaId != null && msg.templateId != null && (
              <span className="text-gray-600"> ({msg.schemaId}/{msg.templateId})</span>
            )}
          </button>
        ))}
      </div>

      {/* Right panel: field tree */}
      <div className="flex-1 overflow-y-auto pl-4">
        <div className="mb-3 text-xs text-gray-500">
          Message {selectedIndex + 1} &mdash; {selected.label} &mdash; {selected.frameLength} bytes at offset 0x{selected.offset.toString(16).padStart(8, '0')}
        </div>
        {groups.map((group, i) => (
          <CollapsibleGroup
            key={i}
            group={group}
            schemaId={selected.schemaId}
            templateId={selected.templateId}
          />
        ))}
      </div>
    </div>
  )
}
