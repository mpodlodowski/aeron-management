import { describe, it, expect } from 'vitest'
import { parseSbeXml } from '../sbeXmlParser'

const MINIMAL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<sbe:messageSchema xmlns:sbe="http://fixprotocol.io/2016/sbe"
  package="test" id="200" version="1" semanticVersion="1.0"
  byteOrder="littleEndian">
  <types>
    <composite name="messageHeader">
      <type name="blockLength" primitiveType="uint16"/>
      <type name="templateId" primitiveType="uint16"/>
      <type name="schemaId" primitiveType="uint16"/>
      <type name="version" primitiveType="uint16"/>
    </composite>
  </types>
  <sbe:message name="Heartbeat" id="1">
    <field name="timestamp" id="1" type="uint64"/>
  </sbe:message>
</sbe:messageSchema>`

describe('parseSbeXml', () => {
  it('parses minimal XML with one message', () => {
    const configs = parseSbeXml(MINIMAL_XML)
    expect(configs).toHaveLength(1)
    expect(configs[0].name).toBe('Heartbeat')
    expect(configs[0].schemaId).toBe(200)
    expect(configs[0].templateId).toBe(1)
    expect(configs[0].code).toContain('getBigUint64')
    expect(configs[0].code).toContain("name: 'timestamp'")
  })

  it('resolves type aliases', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sbe:messageSchema xmlns:sbe="http://fixprotocol.io/2016/sbe" id="100" version="1">
  <types>
    <type name="time_t" primitiveType="int64"/>
  </types>
  <sbe:message name="Event" id="5">
    <field name="eventTime" id="1" type="time_t"/>
  </sbe:message>
</sbe:messageSchema>`

    const configs = parseSbeXml(xml)
    expect(configs).toHaveLength(1)
    expect(configs[0].code).toContain('getBigInt64')
    expect(configs[0].code).toContain("type: 'time_t'")
  })

  it('generates enum inline lookup maps', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sbe:messageSchema xmlns:sbe="http://fixprotocol.io/2016/sbe" id="200" version="1">
  <types>
    <enum name="Side" encodingType="int32">
      <validValue name="BUY">0</validValue>
      <validValue name="SELL">1</validValue>
    </enum>
  </types>
  <sbe:message name="Order" id="1">
    <field name="side" id="1" type="Side"/>
  </sbe:message>
</sbe:messageSchema>`

    const configs = parseSbeXml(xml)
    expect(configs).toHaveLength(1)
    expect(configs[0].code).toContain("'0':'BUY'")
    expect(configs[0].code).toContain("'1':'SELL'")
    expect(configs[0].code).toContain("type: 'enum'")
  })

  it('handles enums with negative values', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sbe:messageSchema xmlns:sbe="http://fixprotocol.io/2016/sbe" id="100" version="1">
  <types>
    <enum name="ResultCode" encodingType="int16">
      <validValue name="SUCCESS">100</validValue>
      <validValue name="INVALID_SYMBOL">-1201</validValue>
    </enum>
  </types>
  <sbe:message name="Response" id="1">
    <field name="result" id="1" type="ResultCode"/>
  </sbe:message>
</sbe:messageSchema>`

    const configs = parseSbeXml(xml)
    expect(configs).toHaveLength(1)

    // Verify the generated code is valid JS (no syntax error from negative keys)
    const fn = new Function('view', 'offset', 'length', configs[0].code)

    const buf = new ArrayBuffer(4)
    const view = new DataView(buf)
    view.setInt16(0, -1201, true)

    const fields = fn(view, 0, 4) as Array<{ name: string; value: unknown; type: string; size: number }>
    expect(fields[0]).toMatchObject({ name: 'result', value: 'INVALID_SYMBOL (-1201)', type: 'enum', size: 2 })
  })

  it('handles char/string fields with length', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sbe:messageSchema xmlns:sbe="http://fixprotocol.io/2016/sbe" id="200" version="1">
  <types>
    <type name="Symbol" primitiveType="char" length="8"/>
  </types>
  <sbe:message name="Quote" id="2">
    <field name="symbol" id="1" type="Symbol"/>
  </sbe:message>
</sbe:messageSchema>`

    const configs = parseSbeXml(xml)
    expect(configs).toHaveLength(1)
    expect(configs[0].code).toContain('TextDecoder')
    expect(configs[0].code).toContain('8')
    expect(configs[0].code).toContain("type: 'string'")
  })

  it('flags messages with <data> or <group> children', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sbe:messageSchema xmlns:sbe="http://fixprotocol.io/2016/sbe" id="200" version="1">
  <types>
    <type name="varDataEncoding" primitiveType="uint8"/>
  </types>
  <sbe:message name="LogEntry" id="3">
    <field name="level" id="1" type="int32"/>
    <data name="message" id="2" type="varDataEncoding"/>
  </sbe:message>
</sbe:messageSchema>`

    const configs = parseSbeXml(xml)
    expect(configs).toHaveLength(1)
    expect(configs[0].name).toBe('LogEntry (fixed block only)')
  })

  it('skips messages with only data/group children', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sbe:messageSchema xmlns:sbe="http://fixprotocol.io/2016/sbe" id="200" version="1">
  <types>
    <type name="varDataEncoding" primitiveType="uint8"/>
  </types>
  <sbe:message name="RawData" id="4">
    <data name="payload" id="1" type="varDataEncoding"/>
  </sbe:message>
</sbe:messageSchema>`

    const configs = parseSbeXml(xml)
    expect(configs).toHaveLength(0)
  })

  it('throws on invalid XML', () => {
    expect(() => parseSbeXml('<not valid xml')).toThrow('Invalid XML')
  })

  it('throws on missing schemaId', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sbe:messageSchema xmlns:sbe="http://fixprotocol.io/2016/sbe" version="1">
  <sbe:message name="Foo" id="1">
    <field name="x" id="1" type="int32"/>
  </sbe:message>
</sbe:messageSchema>`

    expect(() => parseSbeXml(xml)).toThrow('Missing messageSchema id')
  })

  it('generates executable code that decodes a DataView correctly', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sbe:messageSchema xmlns:sbe="http://fixprotocol.io/2016/sbe" id="200" version="1">
  <types>
    <enum name="Side" encodingType="int32">
      <validValue name="BUY">0</validValue>
      <validValue name="SELL">1</validValue>
    </enum>
  </types>
  <sbe:message name="OrderFill" id="1">
    <field name="orderId" id="1" type="int64"/>
    <field name="side" id="2" type="Side"/>
    <field name="price" id="3" type="double"/>
    <field name="quantity" id="4" type="int32"/>
  </sbe:message>
</sbe:messageSchema>`

    const configs = parseSbeXml(xml)
    expect(configs).toHaveLength(1)

    // Build a test buffer
    const buf = new ArrayBuffer(64)
    const view = new DataView(buf)
    const offset = 0

    // orderId: int64 at pos 0
    view.setBigInt64(0, 42n, true)
    // side: int32 at pos 8
    view.setInt32(8, 1, true)
    // price: double at pos 12
    view.setFloat64(12, 99.5, true)
    // quantity: int32 at pos 20
    view.setInt32(20, 100, true)

    // Execute the generated code
    const fn = new Function('view', 'offset', 'length', configs[0].code)
    const fields = fn(view, offset, 64) as Array<{ name: string; value: unknown; type: string; size: number }>

    expect(fields).toHaveLength(4)
    expect(fields[0]).toMatchObject({ name: 'orderId', value: 42n, type: 'int64', size: 8 })
    expect(fields[1]).toMatchObject({ name: 'side', value: 'SELL (1)', type: 'enum', size: 4 })
    expect(fields[2]).toMatchObject({ name: 'price', value: 99.5, type: 'double', size: 8 })
    expect(fields[3]).toMatchObject({ name: 'quantity', value: 100, type: 'int32', size: 4 })
  })

  it('generates executable code for string fields', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sbe:messageSchema xmlns:sbe="http://fixprotocol.io/2016/sbe" id="200" version="1">
  <types>
    <type name="Symbol" primitiveType="char" length="8"/>
  </types>
  <sbe:message name="Quote" id="2">
    <field name="symbol" id="1" type="Symbol"/>
    <field name="price" id="2" type="double"/>
  </sbe:message>
</sbe:messageSchema>`

    const configs = parseSbeXml(xml)

    const buf = new ArrayBuffer(32)
    const view = new DataView(buf)
    const bytes = new Uint8Array(buf)

    // symbol: "AAPL" + 4 null bytes
    const encoder = new TextEncoder()
    bytes.set(encoder.encode('AAPL'), 0)
    // price: double at pos 8
    view.setFloat64(8, 150.25, true)

    const fn = new Function('view', 'offset', 'length', configs[0].code)
    const fields = fn(view, 0, 32) as Array<{ name: string; value: unknown; type: string; size: number }>

    expect(fields).toHaveLength(2)
    expect(fields[0]).toMatchObject({ name: 'symbol', value: 'AAPL', type: 'string', size: 8 })
    expect(fields[1]).toMatchObject({ name: 'price', value: 150.25, type: 'double', size: 8 })
  })

  it('handles composite types like uuid', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sbe:messageSchema xmlns:sbe="http://fixprotocol.io/2016/sbe" id="100" version="1">
  <types>
    <composite name="messageHeader">
      <type name="blockLength" primitiveType="uint16"/>
      <type name="templateId" primitiveType="uint16"/>
      <type name="schemaId" primitiveType="uint16"/>
      <type name="version" primitiveType="uint16"/>
    </composite>
    <composite name="uuid" description="128-bit UUID">
      <type name="mostSigBits" primitiveType="uint64"/>
      <type name="leastSigBits" primitiveType="uint64"/>
    </composite>
  </types>
  <sbe:message name="Order" id="3">
    <field name="orderId" id="1" type="int64"/>
    <field name="orderUuid" id="2" type="uuid"/>
  </sbe:message>
</sbe:messageSchema>`

    const configs = parseSbeXml(xml)
    expect(configs).toHaveLength(1)
    expect(configs[0].code).toContain('getBigUint64')
    expect(configs[0].code).toContain("type: 'uuid'")
    expect(configs[0].code).toContain('size: 16')

    // Execute against test data
    const buf = new ArrayBuffer(32)
    const view = new DataView(buf)
    view.setBigInt64(0, 42n, true) // orderId
    view.setBigUint64(8, 0x0123456789abcdefn, true) // mostSigBits
    view.setBigUint64(16, 0xfedcba9876543210n, true) // leastSigBits

    const fn = new Function('view', 'offset', 'length', configs[0].code)
    const fields = fn(view, 0, 32) as Array<{ name: string; value: unknown; type: string; size: number }>

    expect(fields).toHaveLength(2)
    expect(fields[0]).toMatchObject({ name: 'orderId', value: 42n, size: 8 })
    expect(fields[1]).toMatchObject({ name: 'orderUuid', type: 'uuid', size: 16 })
    // UUID sub-fields rendered as hex
    expect(fields[1].value).toContain('0123456789abcdef')
  })

  it('skips structural composites but keeps field-level composites', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sbe:messageSchema xmlns:sbe="http://fixprotocol.io/2016/sbe" id="100" version="1">
  <types>
    <composite name="messageHeader">
      <type name="blockLength" primitiveType="uint16"/>
      <type name="templateId" primitiveType="uint16"/>
      <type name="schemaId" primitiveType="uint16"/>
      <type name="version" primitiveType="uint16"/>
    </composite>
    <composite name="groupSizeEncoding">
      <type name="blockLength" primitiveType="uint16"/>
      <type name="numInGroup" primitiveType="uint16"/>
    </composite>
    <composite name="uuid">
      <type name="mostSigBits" primitiveType="uint64"/>
      <type name="leastSigBits" primitiveType="uint64"/>
    </composite>
  </types>
  <sbe:message name="Msg" id="1">
    <field name="id" id="1" type="uuid"/>
  </sbe:message>
</sbe:messageSchema>`

    const configs = parseSbeXml(xml)
    expect(configs).toHaveLength(1)
    expect(configs[0].name).toBe('Msg')
  })

  it('parses multiple messages', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sbe:messageSchema xmlns:sbe="http://fixprotocol.io/2016/sbe" id="200" version="1">
  <types/>
  <sbe:message name="NewOrder" id="1">
    <field name="orderId" id="1" type="int64"/>
  </sbe:message>
  <sbe:message name="CancelOrder" id="2">
    <field name="orderId" id="1" type="int64"/>
  </sbe:message>
</sbe:messageSchema>`

    const configs = parseSbeXml(xml)
    expect(configs).toHaveLength(2)
    expect(configs[0].name).toBe('NewOrder')
    expect(configs[0].templateId).toBe(1)
    expect(configs[1].name).toBe('CancelOrder')
    expect(configs[1].templateId).toBe(2)
  })
})
