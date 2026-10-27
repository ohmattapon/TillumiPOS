import { describe, expect, test } from 'bun:test'
import { canSaveAsOrder } from './save-order'

describe('canSaveAsOrder', () => {
  test('a cart of single pieces can be kept as an open order', () => {
    expect(canSaveAsOrder([{}, { packId: undefined }])).toBe(true)
  })

  test('a cart with any pack line cannot, because an order carries no packs', () => {
    expect(canSaveAsOrder([{}, { packId: 4 }])).toBe(false)
  })

  test('an empty cart has nothing to keep', () => {
    expect(canSaveAsOrder([])).toBe(false)
  })
})
