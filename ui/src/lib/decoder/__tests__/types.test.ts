import { describe, it, expect } from 'vitest'
import type { DecodedField, ViewMode } from '../types'

describe('decoder types', () => {
  it('DecodedField is usable', () => {
    const field: DecodedField = {
      name: 'frameLength',
      value: 756,
      type: 'int32',
      offset: 0,
      size: 4,
      layer: 'frame',
    }
    expect(field.name).toBe('frameLength')
    expect(field.layer).toBe('frame')
  })

  it('ViewMode type accepts valid values', () => {
    const modes: ViewMode[] = ['hex', 'tree', 'table']
    expect(modes).toHaveLength(3)
  })
})
