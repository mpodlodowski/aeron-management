import type { Decoder, DecoderResult, CustomDecoderConfig } from './types'
import { clusterCodecDecoders } from './builtins/clusterCodecDecoders'

const STORAGE_KEY = 'aeron-mgmt-decoders'

function makeKey(schemaId: number, templateId: number): string {
  return `${schemaId}:${templateId}`
}

function wrapCustomCode(config: CustomDecoderConfig): Decoder {
  const fn = new Function('view', 'offset', 'length', config.code) as (
    view: DataView, offset: number, length: number,
  ) => Array<{ name: string; value: unknown; type: string; size: number }>

  return {
    name: config.name,
    description: `Custom decoder (schema ${config.schemaId}, template ${config.templateId})`,
    decode(view, offset, available): DecoderResult | null {
      try {
        const raw = fn(view, offset, available)
        let fieldOffset = offset
        return {
          fields: raw.map((f) => {
            const field = {
              name: f.name,
              value: f.value as string | number | bigint | boolean,
              type: f.type,
              offset: fieldOffset,
              size: f.size,
              layer: 'payload' as const,
            }
            fieldOffset += f.size
            return field
          }),
          size: available,
          label: config.name,
        }
      } catch {
        return null
      }
    },
  }
}

export class DecoderRegistry {
  private builtIn = new Map<string, Decoder>()
  private custom = new Map<string, Decoder>()
  private configs: CustomDecoderConfig[] = []

  constructor() {
    for (const [templateId, decoder] of clusterCodecDecoders) {
      this.builtIn.set(makeKey(111, templateId), decoder)
    }
    this.loadFromStorage()
  }

  getDecoder(schemaId: number, templateId: number): Decoder | null {
    const key = makeKey(schemaId, templateId)
    return this.custom.get(key) ?? this.builtIn.get(key) ?? null
  }

  getCustomConfigs(): CustomDecoderConfig[] {
    return [...this.configs]
  }

  addCustomDecoder(config: CustomDecoderConfig): void {
    const key = makeKey(config.schemaId, config.templateId)
    this.configs = this.configs.filter(
      (c) => makeKey(c.schemaId, c.templateId) !== key,
    )
    this.configs.push(config)
    this.custom.set(key, wrapCustomCode(config))
    this.saveToStorage()
  }

  removeAllCustomDecoders(): void {
    this.configs = []
    this.custom.clear()
    this.saveToStorage()
  }

  removeCustomDecoder(schemaId: number, templateId: number): void {
    const key = makeKey(schemaId, templateId)
    this.configs = this.configs.filter(
      (c) => makeKey(c.schemaId, c.templateId) !== key,
    )
    this.custom.delete(key)
    this.saveToStorage()
  }

  exportAll(): string {
    return JSON.stringify(this.configs, null, 2)
  }

  importAll(json: string): void {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) throw new Error('Expected an array of decoder configs')
    const configs = parsed as CustomDecoderConfig[]
    for (const c of configs) {
      if (!c.name || typeof c.schemaId !== 'number' || typeof c.templateId !== 'number' || typeof c.code !== 'string') {
        throw new Error(`Invalid decoder config: ${JSON.stringify(c)}`)
      }
    }
    for (const c of configs) {
      this.addCustomDecoder(c)
    }
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const configs: CustomDecoderConfig[] = JSON.parse(raw)
        for (const c of configs) {
          this.configs.push(c)
          this.custom.set(makeKey(c.schemaId, c.templateId), wrapCustomCode(c))
        }
      }
    } catch {
      // Ignore corrupt storage
    }
  }

  private saveToStorage(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.configs))
  }
}
