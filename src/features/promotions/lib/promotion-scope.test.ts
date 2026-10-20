import { describe, expect, test } from 'bun:test'
import { emptyScope, isGone, scopeEntries, scopeOf, scopeToBody, toggleId } from './promotion-scope'

describe('the scope a promotion is sent with', () => {
  test('ids are sorted without repeats', () => {
    expect(scopeToBody({ productIds: [9, 3, 9], categoryIds: [2] })).toEqual({ productIds: [3, 9], categoryIds: [2] })
  })

  test('nothing chosen is the whole bill', () => {
    expect(scopeToBody(emptyScope)).toBeNull()
  })

  test('a stored promotion puts its scope back, and the whole bill is nothing chosen', () => {
    expect(scopeOf({ scope: { productIds: [3], categoryIds: [] } })).toEqual({ productIds: [3], categoryIds: [] })
    expect(scopeOf({ scope: null })).toEqual(emptyScope)
  })
})

test('a tap chooses an id, and a second tap takes it out', () => {
  expect(toggleId([1, 2], 3)).toEqual([1, 2, 3])
  expect(toggleId([1, 2, 3], 2)).toEqual([1, 3])
})

test('a chosen id that is switched off or gone stays listed with what is wrong, so it can be taken out', () => {
  const known = new Map([[1, { name: 'กาแฟ', isActive: true }], [2, { name: 'ชาเย็น', isActive: false }]])
  expect(scopeEntries([1, 2, 3], known)).toEqual([
    { id: 1, name: 'กาแฟ', status: 'active' },
    { id: 2, name: 'ชาเย็น', status: 'inactive' },
    { id: 3, name: null, status: 'missing' },
  ])
})

test('a chosen id still loading is not called missing', () => {
  expect(scopeEntries([4], new Map(), new Set([4]))).toEqual([{ id: 4, name: null, status: 'loading' }])
})

describe('a product that is gone', () => {
  test('is the one the API answers 404 for', () => {
    expect(isGone(Object.assign(new Error('x'), { status: 404 }))).toBe(true)
    expect(isGone(Object.assign(new Error('x'), { status: 500 }))).toBe(false)
    expect(isGone(new Error('network'))).toBe(false)
    expect(isGone(null)).toBe(false)
  })
})
