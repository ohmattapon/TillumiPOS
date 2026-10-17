import { describe, expect, test } from 'bun:test'
import { hasPackLines } from './order-lines'

describe('hasPackLines', () => {
  test('is true when any line is a pack', () => {
    expect(hasPackLines([{ packId: null }, { packId: 9 }])).toBe(true)
  })

  test('is false for single units and for an empty cart', () => {
    expect(hasPackLines([{ packId: null }])).toBe(false)
    expect(hasPackLines([])).toBe(false)
  })
})
