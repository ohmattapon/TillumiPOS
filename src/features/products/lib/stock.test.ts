import { describe, expect, test } from 'bun:test'
import type { Product } from '@pos/api/types'
import { isLowStock, isOutOfStock, LOW_STOCK_THRESHOLD } from './stock'

const product = (overrides: Partial<Product>) => ({ trackStock: true, stockQty: 10, ...overrides }) as Product

describe('stock flags', () => {
  test('a tracked product with nothing left is out of stock, and so is one that went negative', () => {
    expect(isOutOfStock(product({ stockQty: 0 }))).toBe(true)
    expect(isOutOfStock(product({ stockQty: -2 }))).toBe(true)
    expect(isOutOfStock(product({ stockQty: 1 }))).toBe(false)
  })

  test('a tracked product is low at the threshold and below, not above it', () => {
    expect(isLowStock(product({ stockQty: LOW_STOCK_THRESHOLD }))).toBe(true)
    expect(isLowStock(product({ stockQty: LOW_STOCK_THRESHOLD + 1 }))).toBe(false)
  })

  test('a product that is not tracked is never flagged', () => {
    expect(isOutOfStock(product({ trackStock: false, stockQty: 0 }))).toBe(false)
    expect(isLowStock(product({ trackStock: false, stockQty: 0 }))).toBe(false)
  })
})
