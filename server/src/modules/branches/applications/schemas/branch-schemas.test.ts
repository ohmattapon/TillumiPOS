import { describe, expect, test } from 'bun:test'
import { createBranchSchema, updateBranchSchema } from './branch-schemas'

describe('branch schemas', () => {
  test('a blank address or phone means "none", not an empty string', () => {
    expect(updateBranchSchema.parse({ address: '   ', phone: '' })).toEqual({ address: null, phone: null })
  })

  test('text is trimmed, and null clears a field', () => {
    expect(updateBranchSchema.parse({ address: '  1 ถนนสุขุมวิท  ', phone: null })).toEqual({ address: '1 ถนนสุขุมวิท', phone: null })
  })

  test('a new branch keeps the code as typed, for the entity to normalize', () => {
    expect(createBranchSchema.parse({ code: ' bkk ', name: 'สาขา', phone: '' })).toMatchObject({ code: 'bkk', phone: null })
  })

  test('a text over its limit is refused', () => {
    expect(() => updateBranchSchema.parse({ phone: '0'.repeat(31) })).toThrow()
  })
})
