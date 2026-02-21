import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as prettier from 'prettier/standalone'
import * as babelPlugin from 'prettier/plugins/babel'
import * as estreePlugin from 'prettier/plugins/estree'
import type { CustomDecoderConfig, DecodedMessage } from '../../lib/decoder/types'
import { DecoderRegistry } from '../../lib/decoder/registry'
import { FRAME_HEADER_LENGTH } from '../../lib/decoder/builtins/frameDecoder'
import { SBE_HEADER_LENGTH } from '../../lib/decoder/builtins/sbeHeaderDecoder'
import { parseSbeXml } from '../../lib/decoder/sbeXmlParser'

interface Props {
  registry: DecoderRegistry
  onClose: () => void
  onUpdate: () => void
  data: Uint8Array | null
  messages: DecodedMessage[]
}

interface TestResult {
  fields: Array<{ name: string; value: unknown; type: string; size: number }>
  messageIndex: number
}

const EXAMPLE_CODE = `const field1 = view.getInt32(offset, true)
return [
  { name: 'field1', value: field1, type: 'int32', size: 4 },
]`

export default function DecoderEditor({ registry, onClose, onUpdate, data, messages }: Props) {
  const [configs, setConfigs] = useState<CustomDecoderConfig[]>(registry.getCustomConfigs())
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [schemaId, setSchemaId] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [code, setCode] = useState('')
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const [showDocs, setShowDocs] = useState(false)
  const toggleDocs = useCallback(() => setShowDocs((v) => !v), [])
  const formRef = useRef<HTMLDivElement>(null)
  const importRef = useRef<HTMLDivElement>(null)
  const [showImport, setShowImport] = useState(false)
  const [importJson, setImportJson] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [showSbeImport, setShowSbeImport] = useState(false)
  const [sbeError, setSbeError] = useState<string | null>(null)
  const [sbePreview, setSbePreview] = useState<CustomDecoderConfig[] | null>(null)
  const sbeRef = useRef<HTMLDivElement>(null)
  const sbeFileRef = useRef<HTMLInputElement>(null)

  // Live test: run decoder against real data on every change
  const liveResult = useMemo<{ result?: TestResult; error?: string; noMatch?: boolean } | null>(() => {
    if (!showForm || !code.trim()) return null
    const sid = parseInt(schemaId, 10)
    const tid = parseInt(templateId, 10)
    if (isNaN(sid) || isNaN(tid)) return null
    if (!data) return { noMatch: true }

    // Find first matching message in current chunk
    const matchIdx = messages.findIndex(
      (m) => m.schemaId === sid && m.templateId === tid,
    )
    if (matchIdx === -1) return { noMatch: true }

    const msg = messages[matchIdx]
    const payloadOffset = msg.localOffset + FRAME_HEADER_LENGTH + SBE_HEADER_LENGTH
    const payloadLength = msg.frameLength - FRAME_HEADER_LENGTH - SBE_HEADER_LENGTH

    if (payloadLength <= 0) return { error: 'Message has no payload bytes' }

    try {
      const fn = new Function('view', 'offset', 'length', code)
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
      const fields = fn(view, payloadOffset, payloadLength)
      if (!Array.isArray(fields)) {
        return { error: 'Function must return an array' }
      }
      return { result: { fields, messageIndex: matchIdx } }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Unknown error' }
    }
  }, [showForm, code, schemaId, templateId, data, messages])

  // Count matching messages for status display
  const matchCount = useMemo(() => {
    const sid = parseInt(schemaId, 10)
    const tid = parseInt(templateId, 10)
    if (isNaN(sid) || isNaN(tid)) return 0
    return messages.filter((m) => m.schemaId === sid && m.templateId === tid).length
  }, [schemaId, templateId, messages])

  function startNew() {
    setName('')
    setSchemaId('')
    setTemplateId('')
    setCode(EXAMPLE_CODE)
    setShowForm(true)
  }

  function startEdit(config: CustomDecoderConfig) {
    setName(config.name)
    setSchemaId(String(config.schemaId))
    setTemplateId(String(config.templateId))
    setCode(config.code)
    setShowForm(true)
  }

  useEffect(() => {
    if (showForm) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [showForm])

  useEffect(() => {
    if (showImport) importRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [showImport])

  useEffect(() => {
    if (showSbeImport) sbeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [showSbeImport])

  function handleSbeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const configs = parseSbeXml(reader.result as string)
        setSbePreview(configs)
        setSbeError(null)
      } catch (err) {
        setSbeError(err instanceof Error ? err.message : 'Failed to parse XML')
        setSbePreview(null)
      }
    }
    reader.readAsText(file)
  }

  function handleSbeImportAll() {
    if (!sbePreview) return
    const errors: string[] = []
    for (const config of sbePreview) {
      try {
        registry.addCustomDecoder(config)
      } catch (e) {
        errors.push(`${config.name}: ${e instanceof Error ? e.message : 'unknown error'}`)
      }
    }
    setConfigs(registry.getCustomConfigs())
    if (errors.length > 0) {
      setSbeError(`Imported ${sbePreview.length - errors.length}/${sbePreview.length} decoders. Failed: ${errors.join('; ')}`)
      setSbePreview(null)
    } else {
      setShowSbeImport(false)
      setSbePreview(null)
      setSbeError(null)
      if (sbeFileRef.current) sbeFileRef.current.value = ''
    }
    onUpdate()
  }

  function cancelSbeImport() {
    setShowSbeImport(false)
    setSbePreview(null)
    setSbeError(null)
    if (sbeFileRef.current) sbeFileRef.current.value = ''
  }

  function formatCode() {
    // Wrap in a function so Prettier can parse it as valid JS, then unwrap
    const wrapped = `function _f(view, offset, length) {\n${code}\n}`
    prettier
      .format(wrapped, {
        parser: 'babel',
        plugins: [babelPlugin, estreePlugin],
        printWidth: 100,
        semi: true,
        singleQuote: true,
        tabWidth: 2,
      })
      .then((formatted) => {
        // Strip the wrapper function
        const lines = formatted.split('\n')
        // Remove first line "function _f(...) {" and last line "}"
        const body = lines.slice(1, -2)
        // Remove one level of indentation
        const dedented = body.map((l) => (l.startsWith('  ') ? l.slice(2) : l))
        setCode(dedented.join('\n').trimEnd())
      })
      .catch(() => {
        // If parsing fails, leave code unchanged
      })
  }

  function cancelForm() {
    setShowForm(false)
    setName('')
  }

  function save() {
    const sid = parseInt(schemaId, 10)
    const tid = parseInt(templateId, 10)
    if (!name || isNaN(sid) || isNaN(tid) || !code.trim()) return

    const config: CustomDecoderConfig = { name, schemaId: sid, templateId: tid, code }
    registry.addCustomDecoder(config)
    setConfigs(registry.getCustomConfigs())
    setShowForm(false)
    setName('')
    setSchemaId('')
    setTemplateId('')
    setCode('')
    onUpdate()
  }

  function remove(config: CustomDecoderConfig) {
    registry.removeCustomDecoder(config.schemaId, config.templateId)
    setConfigs(registry.getCustomConfigs())
    onUpdate()
  }

  function handleExport() {
    const json = registry.exportAll()
    navigator.clipboard.writeText(json).then(() => {
      setExportStatus(configs.length > 0 ? 'Copied!' : 'Copied (empty)')
      setTimeout(() => setExportStatus(null), 2000)
    })
  }

  function handleImportSubmit() {
    if (!importJson.trim()) return
    try {
      registry.importAll(importJson)
      setConfigs(registry.getCustomConfigs())
      setShowImport(false)
      setImportJson('')
      setImportError(null)
      onUpdate()
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Invalid JSON')
    }
  }

  function formatValue(v: unknown): string {
    if (typeof v === 'bigint') return v.toString()
    if (typeof v === 'string') return v
    return String(v)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-lg border border-gray-700 bg-gray-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-200">Custom Decoders</h2>
          <div className="flex items-center gap-2">
            <button onClick={handleExport} className="text-xs text-gray-400 hover:text-gray-200">
              {exportStatus ?? 'Export'}
            </button>
            <button onClick={() => { setShowImport(true); setImportError(null) }} className="text-xs text-gray-400 hover:text-gray-200">Import</button>
            <button onClick={() => setShowSbeImport(true)} className="text-xs text-gray-400 hover:text-gray-200">Import SBE XML</button>
            {configs.length > 0 && !confirmDeleteAll && (
              <button onClick={() => setConfirmDeleteAll(true)} className="text-xs text-red-400 hover:text-red-300">Delete All</button>
            )}
            {confirmDeleteAll && (
              <span className="flex items-center gap-1">
                <button
                  onClick={() => {
                    registry.removeAllCustomDecoders()
                    setConfigs([])
                    setConfirmDeleteAll(false)
                    onUpdate()
                  }}
                  className="text-xs text-red-400 hover:text-red-300 font-medium"
                >
                  Confirm
                </button>
                <button onClick={() => setConfirmDeleteAll(false)} className="text-xs text-gray-500 hover:text-gray-300">Cancel</button>
              </span>
            )}
            <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-200">Close</button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Import panel */}
          {showImport && (
            <div ref={importRef} className="space-y-2 border border-gray-800 rounded-lg p-3">
              <div className="text-xs text-gray-400">Paste decoder JSON array:</div>
              <textarea
                value={importJson}
                onChange={(e) => { setImportJson(e.target.value); setImportError(null) }}
                rows={6}
                spellCheck={false}
                placeholder='[{ "name": "...", "schemaId": 100, "templateId": 1, "code": "..." }]'
                className="w-full rounded bg-gray-950 border border-gray-700 px-3 py-2 font-mono text-xs text-gray-200 resize-y"
              />
              {importError && (
                <div className="text-xs text-red-400">{importError}</div>
              )}
              <div className="flex gap-2">
                <button onClick={handleImportSubmit} className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500">
                  Import
                </button>
                <button onClick={() => { setShowImport(false); setImportJson(''); setImportError(null) }} className="rounded bg-gray-800 px-3 py-1 text-xs text-gray-400 hover:bg-gray-700">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* SBE XML import panel */}
          {showSbeImport && (
            <div ref={sbeRef} className="space-y-2 border border-gray-800 rounded-lg p-3">
              <div className="text-xs text-gray-400">Select an SBE XML schema file:</div>
              <input
                ref={sbeFileRef}
                type="file"
                accept=".xml"
                onChange={handleSbeFile}
                className="block w-full text-xs text-gray-400 file:mr-2 file:rounded file:border-0 file:bg-gray-800 file:px-3 file:py-1 file:text-xs file:text-gray-300 hover:file:bg-gray-700"
              />
              {sbeError && (
                <div className="text-xs text-red-400">{sbeError}</div>
              )}
              {sbePreview && (
                <div className="space-y-2">
                  <div className="text-xs text-gray-300">{sbePreview.length} decoder{sbePreview.length !== 1 ? 's' : ''} found:</div>
                  <div className="max-h-40 overflow-auto rounded bg-gray-950 border border-gray-700 p-2 space-y-1">
                    {sbePreview.map((c) => (
                      <div key={`${c.schemaId}:${c.templateId}`} className="flex items-baseline gap-2 text-xs font-mono">
                        <span className="text-gray-200">{c.name}</span>
                        <span className="text-gray-500">schema={c.schemaId} template={c.templateId}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                {sbePreview && sbePreview.length > 0 && (
                  <button onClick={handleSbeImportAll} className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500">
                    Import All
                  </button>
                )}
                <button onClick={cancelSbeImport} className="rounded bg-gray-800 px-3 py-1 text-xs text-gray-400 hover:bg-gray-700">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Decoder list */}
          {configs.length > 0 && (
            <div className="space-y-1">
              {configs.map((c) => (
                <div key={`${c.schemaId}:${c.templateId}`} className="flex items-center justify-between rounded bg-gray-800 px-3 py-2">
                  <div>
                    <span className="text-sm text-gray-200">{c.name}</span>
                    <span className="ml-2 text-xs text-gray-500">schema={c.schemaId} template={c.templateId}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(c)} className="text-xs text-blue-400 hover:text-blue-300">Edit</button>
                    <button onClick={() => remove(c)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Editor form */}
          {showForm ? (
            <div ref={formRef} className="space-y-3 border border-gray-800 rounded-lg p-3">
              <div className="flex gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Decoder name"
                  className="flex-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-200"
                />
                <input
                  value={schemaId}
                  onChange={(e) => setSchemaId(e.target.value)}
                  placeholder="Schema ID"
                  type="number"
                  className="w-24 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-200"
                />
                <input
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  placeholder="Template ID"
                  type="number"
                  className="w-24 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-200"
                />
                {schemaId && templateId && (
                  <span className="self-center text-xs text-gray-500 whitespace-nowrap">
                    {matchCount > 0
                      ? `${matchCount} match${matchCount !== 1 ? 'es' : ''}`
                      : 'no matches'}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">
                  function(view: DataView, offset: number, length: number) &#123;
                </div>
                <button
                  onClick={toggleDocs}
                  className="text-[10px] text-blue-400 hover:text-blue-300"
                >
                  {showDocs ? 'Hide docs' : 'API reference'}
                </button>
              </div>
              {showDocs && (
                <div className="rounded border border-gray-800 bg-gray-950 px-3 py-2 text-[11px] text-gray-400 space-y-2 leading-relaxed">
                  <div>
                    <span className="text-gray-300 font-medium">Parameters</span>
                    <div className="font-mono mt-0.5 space-y-0.5">
                      <div><span className="text-blue-400">view</span>: DataView — raw recording bytes</div>
                      <div><span className="text-blue-400">offset</span>: number — start of payload (after frame + SBE headers)</div>
                      <div><span className="text-blue-400">length</span>: number — payload byte count</div>
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-300 font-medium">Return</span>
                    <div className="font-mono mt-0.5">
                      {'Array<{ name: string, value: string|number|bigint|boolean, type: string, size: number }>'}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-300 font-medium">Suggested type values</span>
                    <div className="font-mono mt-0.5">
                      int8, uint8, int16, uint16, int32, uint32, int64, uint64, float, double, bool, uuid, enum, string
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-300 font-medium">DataView reads</span> <span className="text-gray-600">(all little-endian: pass true)</span>
                    <div className="font-mono mt-0.5 grid grid-cols-2 gap-x-4 gap-y-0.5">
                      <div>getInt8(off)</div>
                      <div>getUint8(off)</div>
                      <div>getInt16(off, true)</div>
                      <div>getUint16(off, true)</div>
                      <div>getInt32(off, true)</div>
                      <div>getUint32(off, true)</div>
                      <div>getBigInt64(off, true)</div>
                      <div>getBigUint64(off, true)</div>
                      <div>getFloat32(off, true)</div>
                      <div>getFloat64(off, true)</div>
                    </div>
                  </div>
                </div>
              )}
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                rows={8}
                spellCheck={false}
                className="w-full rounded bg-gray-950 border border-gray-700 px-3 py-2 font-mono text-xs text-gray-200 resize-y"
              />
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">&#125;</div>
                <button onClick={formatCode} className="text-[10px] text-gray-500 hover:text-gray-300">Format</button>
              </div>

              {/* Live results */}
              {liveResult && (
                <div className="rounded border border-gray-800 bg-gray-950 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-gray-600 mb-2">
                    Live Preview
                  </div>
                  {liveResult.error && (
                    <div className="text-xs text-red-400 font-mono">{liveResult.error}</div>
                  )}
                  {liveResult.noMatch && (
                    <div className="text-xs text-yellow-500">
                      No messages with schema {schemaId} / template {templateId} in current chunk.
                      Navigate to a chunk containing matching messages to test.
                    </div>
                  )}
                  {liveResult.result && (
                    <div className="space-y-0.5">
                      <div className="text-[10px] text-gray-600 mb-1">
                        Testing against message #{liveResult.result.messageIndex + 1}
                      </div>
                      {liveResult.result.fields.map((f, i) => (
                        <div key={i} className="flex items-baseline gap-2 text-xs font-mono">
                          <span className="text-gray-500 min-w-[100px] shrink-0">{f.name}</span>
                          <span className="text-emerald-400">{formatValue(f.value)}</span>
                          <span className="text-gray-600 text-[10px]">{f.type} ({f.size}B)</span>
                        </div>
                      ))}
                      {liveResult.result.fields.length === 0 && (
                        <div className="text-xs text-gray-500 italic">Empty array returned</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={save} className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500">
                  Save
                </button>
                <button onClick={cancelForm} className="rounded bg-gray-800 px-3 py-1 text-xs text-gray-400 hover:bg-gray-700">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={startNew}
              className="w-full rounded border border-dashed border-gray-700 py-2 text-xs text-gray-500 hover:text-gray-300 hover:border-gray-500"
            >
              + Add Custom Decoder
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
