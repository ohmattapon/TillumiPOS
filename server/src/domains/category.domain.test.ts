import { describe, expect, test } from 'bun:test'
import { CategoryEntity } from './category.domain'
import { DomainError } from './errors/domain-error'

const valid = { id: 1, name: 'เครื่องดื่ม', sortOrder: 0, isActive: true }

describe('CategoryEntity', () => {
  test('holds its properties', () => {
    expect(new CategoryEntity(valid).toSnapshot()).toEqual(valid)
  })

  test.each(['', 'x'.repeat(101)])('rejects a name of length %#: empty or over 100 characters', (name) => {
    expect(() => new CategoryEntity({ ...valid, name })).toThrow(DomainError)
  })

  test('accepts a name of exactly 100 characters', () => {
    expect(new CategoryEntity({ ...valid, name: 'x'.repeat(100) }).name).toHaveLength(100)
  })

  test.each([1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects a non-integer sort order (%p)', (sortOrder) => {
    expect(() => new CategoryEntity({ ...valid, sortOrder })).toThrow(DomainError)
  })

  test('accepts a negative sort order', () => {
    expect(new CategoryEntity({ ...valid, sortOrder: -1 }).sortOrder).toBe(-1)
  })

  test('with() returns a changed copy and leaves the original alone', () => {
    const original = new CategoryEntity(valid)

    const renamed = original.with({ name: 'ขนม', isActive: false })

    expect(renamed.toSnapshot()).toEqual({ id: 1, name: 'ขนม', sortOrder: 0, isActive: false })
    expect(original.toSnapshot()).toEqual(valid)
  })

  test('with() ignores undefined fields, so a partial update keeps the rest', () => {
    const changed = new CategoryEntity(valid).with({ name: undefined, sortOrder: 5 })

    expect(changed.toSnapshot()).toEqual({ ...valid, sortOrder: 5 })
  })

  test('with() enforces the same rules as the constructor', () => {
    expect(() => new CategoryEntity(valid).with({ name: '' })).toThrow(DomainError)
  })
})
