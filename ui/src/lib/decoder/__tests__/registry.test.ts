import { describe, it, expect, beforeEach } from 'vitest'
import { DecoderRegistry } from '../registry'

describe('DecoderRegistry', () => {
  let registry: DecoderRegistry

  beforeEach(() => {
    localStorage.clear()
    registry = new DecoderRegistry()
  })

  it('has built-in SnapshotMarker decoder for schema 111 template 100', () => {
    const decoder = registry.getDecoder(111, 100)
    expect(decoder).not.toBeNull()
    expect(decoder!.name).toBe('SnapshotMarker')
  })

  it('has built-in cluster codec decoders for schema 111', () => {
    expect(registry.getDecoder(111, 1)!.name).toBe('SessionMessageHeader')
    expect(registry.getDecoder(111, 22)!.name).toBe('SessionCloseEvent')
    expect(registry.getDecoder(111, 102)!.name).toBe('ClientSession')
    expect(registry.getDecoder(111, 105)!.name).toBe('ConsensusModule')
  })

  it('returns null for unknown schema/template', () => {
    expect(registry.getDecoder(999, 999)).toBeNull()
  })

  it('adds and retrieves custom decoders', () => {
    registry.addCustomDecoder({
      name: 'MyDecoder',
      schemaId: 100,
      templateId: 3,
      code: 'return [{ name: "x", value: 1, type: "int32", size: 4 }]',
    })
    const decoder = registry.getDecoder(100, 3)
    expect(decoder).not.toBeNull()
    expect(decoder!.name).toBe('MyDecoder')
  })

  it('custom decoders override built-in', () => {
    registry.addCustomDecoder({
      name: 'OverrideMarker',
      schemaId: 111,
      templateId: 100,
      code: 'return [{ name: "custom", value: true, type: "bool", size: 1 }]',
    })
    expect(registry.getDecoder(111, 100)!.name).toBe('OverrideMarker')
  })

  it('removes custom decoders', () => {
    registry.addCustomDecoder({
      name: 'Temp',
      schemaId: 200,
      templateId: 1,
      code: 'return []',
    })
    expect(registry.getDecoder(200, 1)).not.toBeNull()
    registry.removeCustomDecoder(200, 1)
    expect(registry.getDecoder(200, 1)).toBeNull()
  })

  it('persists to localStorage', () => {
    registry.addCustomDecoder({
      name: 'Persisted',
      schemaId: 300,
      templateId: 5,
      code: 'return []',
    })
    const registry2 = new DecoderRegistry()
    expect(registry2.getDecoder(300, 5)!.name).toBe('Persisted')
  })

  it('exports and imports configs', () => {
    registry.addCustomDecoder({
      name: 'Exportable',
      schemaId: 400,
      templateId: 1,
      code: 'return []',
    })
    const json = registry.exportAll()
    localStorage.clear()
    const registry2 = new DecoderRegistry()
    registry2.importAll(json)
    expect(registry2.getDecoder(400, 1)!.name).toBe('Exportable')
  })
})
