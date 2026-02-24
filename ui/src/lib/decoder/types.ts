export interface DecodedField {
  name: string
  value: string | number | bigint | boolean
  type: string    // 'uint8','uint16','int32','int64','string','enum','bytes','hex'
  offset: number  // byte offset relative to chunk start
  size: number    // byte length of this field
  layer: 'frame' | 'sbe' | 'payload' | 'nested-sbe'
}

export interface DecodedMessage {
  offset: number          // absolute offset in recording
  localOffset: number     // offset within current chunk
  frameLength: number     // total frame size including header
  fields: DecodedField[]  // all decoded fields across all layers
  templateId?: number
  schemaId?: number
  label: string           // human-readable type name
  raw: Uint8Array         // raw bytes for this frame
}

export interface DecoderResult {
  fields: DecodedField[]
  size: number            // bytes consumed
  label?: string          // override message label
}

export interface Decoder {
  name: string
  description: string
  decode(view: DataView, offset: number, available: number): DecoderResult | null
}

export interface CustomDecoderConfig {
  name: string
  schemaId: number
  templateId: number
  code: string  // JS function body receiving (view, offset, length)
}

export interface DecodeChunkResult {
  messages: DecodedMessage[]
  nextOffset: number       // absolute offset where next fetch should start (frame-aligned)
  nextFetchSize: number    // minimum bytes to fetch from nextOffset (may exceed default if a large frame was detected)
}

export type ViewMode = 'hex' | 'tree' | 'table'
