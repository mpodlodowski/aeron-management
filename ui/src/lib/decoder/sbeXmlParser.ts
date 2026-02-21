import type { CustomDecoderConfig } from './types'

const SBE_NS = 'http://fixprotocol.io/2016/sbe'

interface PrimitiveInfo {
  reader: string
  size: number
  littleEndian: boolean | null // null = not applicable (single byte)
}

const PRIMITIVE_MAP: Record<string, PrimitiveInfo> = {
  uint8:  { reader: 'getUint8',    size: 1, littleEndian: null },
  int8:   { reader: 'getInt8',     size: 1, littleEndian: null },
  uint16: { reader: 'getUint16',   size: 2, littleEndian: true },
  int16:  { reader: 'getInt16',    size: 2, littleEndian: true },
  uint32: { reader: 'getUint32',   size: 4, littleEndian: true },
  int32:  { reader: 'getInt32',    size: 4, littleEndian: true },
  uint64: { reader: 'getBigUint64', size: 8, littleEndian: true },
  int64:  { reader: 'getBigInt64',  size: 8, littleEndian: true },
  float:  { reader: 'getFloat32',  size: 4, littleEndian: true },
  double: { reader: 'getFloat64',  size: 8, littleEndian: true },
}

interface TypeAlias {
  kind: 'alias'
  primitiveType: string
}

interface StringType {
  kind: 'string'
  length: number
}

interface EnumType {
  kind: 'enum'
  encodingType: string
  values: Record<string, string> // value → name
}

interface CompositeType {
  kind: 'composite'
  fields: Array<{ name: string; primitiveType: string }>
  totalSize: number
}

type SbeType = TypeAlias | StringType | EnumType | CompositeType

// Structural composites that are not used as field types
const STRUCTURAL_COMPOSITES = new Set([
  'messageHeader', 'groupSizeEncoding', 'varDataEncoding',
  'varStringEncoding', 'varAsciiEncoding',
])

function buildTypeMap(doc: Document): Map<string, SbeType> {
  const types = new Map<string, SbeType>()

  const typesSections = doc.getElementsByTagName('types')
  for (let s = 0; s < typesSections.length; s++) {
    const section = typesSections[s]

    // Process direct children of <types> only to avoid picking up
    // <type> elements nested inside <composite> or <enum>
    for (let i = 0; i < section.children.length; i++) {
      const el = section.children[i]
      const localName = el.localName

      if (localName === 'type') {
        const name = el.getAttribute('name')
        const primitiveType = el.getAttribute('primitiveType')
        if (!name || !primitiveType) continue

        const length = el.getAttribute('length')
        if (primitiveType === 'char' && length && parseInt(length, 10) > 1) {
          types.set(name, { kind: 'string', length: parseInt(length, 10) })
        } else {
          types.set(name, { kind: 'alias', primitiveType })
        }
      } else if (localName === 'enum') {
        const name = el.getAttribute('name')
        const encodingType = el.getAttribute('encodingType')
        if (!name || !encodingType) continue

        const values: Record<string, string> = {}
        const validValues = el.getElementsByTagName('validValue')
        for (let j = 0; j < validValues.length; j++) {
          const vv = validValues[j]
          const vName = vv.getAttribute('name')
          const vValue = vv.textContent?.trim()
          if (vName && vValue !== undefined && vValue !== null) {
            values[vValue] = vName
          }
        }

        types.set(name, { kind: 'enum', encodingType, values })
      } else if (localName === 'composite') {
        const name = el.getAttribute('name')
        if (!name || STRUCTURAL_COMPOSITES.has(name)) continue

        // Parse child <type> elements to build composite field list
        const fields: Array<{ name: string; primitiveType: string }> = []
        let totalSize = 0
        let valid = true

        for (let j = 0; j < el.children.length; j++) {
          const child = el.children[j]
          if (child.localName !== 'type') continue
          const fName = child.getAttribute('name')
          const fPrimitive = child.getAttribute('primitiveType')
          if (!fName || !fPrimitive) { valid = false; break }
          const prim = PRIMITIVE_MAP[fPrimitive]
          if (!prim) { valid = false; break }
          fields.push({ name: fName, primitiveType: fPrimitive })
          totalSize += prim.size
        }

        if (valid && fields.length > 0) {
          types.set(name, { kind: 'composite', fields, totalSize })
        }
      }
    }
  }

  return types
}

function resolveType(typeName: string, typeMap: Map<string, SbeType>): SbeType | PrimitiveInfo | null {
  // Check if it's a direct primitive
  if (PRIMITIVE_MAP[typeName]) return PRIMITIVE_MAP[typeName]

  const mapped = typeMap.get(typeName)
  if (!mapped) return null

  if (mapped.kind === 'alias') {
    // Resolve alias to a primitive
    return PRIMITIVE_MAP[mapped.primitiveType] ?? null
  }

  return mapped
}

function generateFieldCode(
  fieldName: string,
  typeName: string,
  typeMap: Map<string, SbeType>,
): { code: string; size: number } | null {
  const resolved = resolveType(typeName, typeMap)
  if (!resolved) return null

  // PrimitiveInfo (direct primitive or alias)
  if ('reader' in resolved) {
    const prim = resolved as PrimitiveInfo
    const leArg = prim.littleEndian !== null ? ', true' : ''
    return {
      code:
        `// ${fieldName}: ${typeName} (${prim.size}B)\n` +
        `fields.push({ name: '${fieldName}', value: view.${prim.reader}(pos${leArg}), type: '${typeName}', size: ${prim.size} }); pos += ${prim.size};`,
      size: prim.size,
    }
  }

  if (resolved.kind === 'string') {
    return {
      code:
        `// ${fieldName}: string (${resolved.length}B)\n` +
        `fields.push({ name: '${fieldName}', value: new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset + pos, ${resolved.length})).replace(/\\0+$/, ''), type: 'string', size: ${resolved.length} }); pos += ${resolved.length};`,
      size: resolved.length,
    }
  }

  if (resolved.kind === 'enum') {
    const encPrim = PRIMITIVE_MAP[resolved.encodingType]
    if (!encPrim) return null
    const leArg = encPrim.littleEndian !== null ? ', true' : ''
    const mapEntries = Object.entries(resolved.values)
      .map(([val, name]) => `'${val}':'${name}'`)
      .join(',')

    return {
      code:
        `// ${fieldName}: ${typeName} (enum ${resolved.encodingType}, ${encPrim.size}B)\n` +
        `var ${fieldName}_m = {${mapEntries}}; var ${fieldName}_v = view.${encPrim.reader}(pos${leArg});\n` +
        `fields.push({ name: '${fieldName}', value: ${fieldName}_m[${fieldName}_v] ? ${fieldName}_m[${fieldName}_v]+' ('+${fieldName}_v+')' : String(${fieldName}_v), type: 'enum', size: ${encPrim.size} }); pos += ${encPrim.size};`,
      size: encPrim.size,
    }
  }

  if (resolved.kind === 'composite') {
    // Read each sub-field and combine into a display string
    const reads: string[] = []
    const parts: string[] = []
    let subOffset = 0
    for (const f of resolved.fields) {
      const prim = PRIMITIVE_MAP[f.primitiveType]!
      const leArg = prim.littleEndian !== null ? ', true' : ''
      const varName = `${fieldName}_${f.name}`
      reads.push(`var ${varName} = view.${prim.reader}(pos + ${subOffset}${leArg});`)
      // Format bigint sub-fields as hex for readability (e.g. UUID parts)
      if (f.primitiveType === 'uint64' || f.primitiveType === 'int64') {
        parts.push(`${varName}.toString(16).padStart(16, '0')`)
      } else {
        parts.push(`String(${varName})`)
      }
      subOffset += prim.size
    }

    return {
      code:
        `// ${fieldName}: ${typeName} (composite, ${resolved.totalSize}B)\n` +
        reads.join(' ') + '\n' +
        `fields.push({ name: '${fieldName}', value: ${parts.join("+'-'+")} , type: '${typeName}', size: ${resolved.totalSize} }); pos += ${resolved.totalSize};`,
      size: resolved.totalSize,
    }
  }

  return null
}

export function parseSbeXml(xmlText: string): CustomDecoderConfig[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'text/xml')

  // Check for parse errors
  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    throw new Error(`Invalid XML: ${parseError.textContent?.trim()}`)
  }

  const schema = doc.documentElement
  const schemaIdAttr = schema.getAttribute('id')
  if (!schemaIdAttr) {
    throw new Error('Missing messageSchema id attribute')
  }
  const schemaId = parseInt(schemaIdAttr, 10)
  if (isNaN(schemaId)) {
    throw new Error(`Invalid messageSchema id: ${schemaIdAttr}`)
  }

  const typeMap = buildTypeMap(doc)
  const configs: CustomDecoderConfig[] = []

  // Try namespace-aware lookup first, fall back to local name
  let messageEls = doc.getElementsByTagNameNS(SBE_NS, 'message')
  if (messageEls.length === 0) {
    messageEls = doc.getElementsByTagName('message')
  }

  for (let i = 0; i < messageEls.length; i++) {
    const msg = messageEls[i]
    const msgName = msg.getAttribute('name')
    const templateIdAttr = msg.getAttribute('id')
    if (!msgName || !templateIdAttr) continue

    const templateId = parseInt(templateIdAttr, 10)
    if (isNaN(templateId)) continue

    // Collect <field> children (direct children only)
    const fieldEls: Element[] = []
    const hasVarData = { groups: false, data: false }

    for (let j = 0; j < msg.children.length; j++) {
      const child = msg.children[j]
      const localName = child.localName
      if (localName === 'field') {
        fieldEls.push(child)
      } else if (localName === 'group') {
        hasVarData.groups = true
      } else if (localName === 'data') {
        hasVarData.data = true
      }
    }

    // Skip messages with no fixed fields
    if (fieldEls.length === 0) continue

    // Generate code for each field
    const codeLines: string[] = ['var fields = []; var pos = offset;']
    let valid = true

    for (const fieldEl of fieldEls) {
      const fName = fieldEl.getAttribute('name')
      const fType = fieldEl.getAttribute('type')
      if (!fName || !fType) { valid = false; break }

      const result = generateFieldCode(fName, fType, typeMap)
      if (!result) { valid = false; break }
      codeLines.push(result.code)
    }

    if (!valid) continue

    codeLines.push('return fields;')

    const hasVarElements = hasVarData.groups || hasVarData.data
    const decoderName = hasVarElements ? `${msgName} (fixed block only)` : msgName

    configs.push({
      name: decoderName,
      schemaId,
      templateId,
      code: codeLines.join('\n'),
    })
  }

  return configs
}
