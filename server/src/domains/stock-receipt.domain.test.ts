import { describe, expect, test } from 'bun:test'
import { normalizeReceiptItems, POSTGRES_INT_MAX } from './stock-receipt.domain'

describe('stock receipt normalization', () => {
  test('combines duplicates and sorts by product id', () => {
    expect(normalizeReceiptItems([{ productId: 2, quantity: 3 }, { productId: 1, quantity: 2 }, { productId: 2, quantity: 4 }]))
      .toEqual([{ productId: 1, quantity: 2 }, { productId: 2, quantity: 7 }])
  })
  test('rejects combined quantities beyond the storage range with the product id', () => {
    try { normalizeReceiptItems([{ productId: 2, quantity: POSTGRES_INT_MAX }, { productId: 2, quantity: 1 }]); throw new Error('expected rejection') }
    catch (error) { expect(error).toMatchObject({ code: 'STOCK_RECEIPT_INVALID_ITEMS', params: { productIds: '2' } }) }
  })
})
