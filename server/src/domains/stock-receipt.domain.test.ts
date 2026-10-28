import { describe, expect, test } from 'bun:test'
import { normalizeReceiptItems, packReceiptNote, POSTGRES_INT_MAX, receiptPieces } from './stock-receipt.domain'

describe('receiving in packs', () => {
  test('counts a pack line in the pieces it holds', () => {
    expect(receiptPieces(2, 12, 5)).toBe(24)
  })
  test('rejects a pack count beyond the storage range with the product id', () => {
    try { receiptPieces(2, POSTGRES_INT_MAX, 5); throw new Error('expected rejection') }
    catch (error) { expect(error).toMatchObject({ code: 'STOCK_RECEIPT_INVALID_ITEMS', params: { productIds: '5' } }) }
  })
  test('writes how many packs and pieces arrived', () => {
    expect(packReceiptNote(null, 2, { barcode: 'CASE-1', size: 12 })).toBe('รับ 2 ลัง (CASE-1) = 24 ชิ้น')
  })
  test('keeps a note the user typed in front of the pack count', () => {
    expect(packReceiptNote('PO-1', 3, { barcode: 'CASE-1', size: 12 })).toBe('PO-1 · รับ 3 ลัง (CASE-1) = 36 ชิ้น')
  })
})

describe('stock receipt normalization', () => {
  test('combines duplicates and sorts by product id', () => {
    expect(normalizeReceiptItems([{ productId: 2, quantity: 3 }, { productId: 1, quantity: 2 }, { productId: 2, quantity: 4 }]))
      .toEqual([{ productId: 1, quantity: 2 }, { productId: 2, quantity: 7 }])
  })
  test('rejects combined quantities beyond the storage range with the product id', () => {
    try { normalizeReceiptItems([{ productId: 2, quantity: POSTGRES_INT_MAX }, { productId: 2, quantity: 1 }]); throw new Error('expected rejection') }
    catch (error) { expect(error).toMatchObject({ code: 'STOCK_RECEIPT_INVALID_ITEMS', params: { productIds: '2' } }) }
  })
  test('keeps a pack line apart from a piece line of the same product', () => {
    expect(normalizeReceiptItems([{ productId: 1, quantity: 2, packId: 5 }, { productId: 1, quantity: 3 }]))
      .toEqual([{ productId: 1, quantity: 3 }, { productId: 1, quantity: 2, packId: 5 }])
  })
  test('combines duplicates of the same pack', () => {
    expect(normalizeReceiptItems([{ productId: 1, quantity: 2, packId: 5 }, { productId: 1, quantity: 1, packId: 5 }]))
      .toEqual([{ productId: 1, quantity: 3, packId: 5 }])
  })
})
