import { expect, test } from 'bun:test'
import { formatProductSku } from './product-sku'

test('SKU numbers have at least six digits and grow without truncation', () => {
  expect(formatProductSku(1)).toBe('SKU-000001')
  expect(formatProductSku(999999)).toBe('SKU-999999')
  expect(formatProductSku(1000000)).toBe('SKU-1000000')
})
