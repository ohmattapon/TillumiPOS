import { describe, expect, test } from 'bun:test'
import { DomainError } from './errors/domain-error'
import { assertValidPack, packUnitCostSatang, packUnitPriceSatang, type ProductPack } from './product-pack'
import { MAX_AMOUNT_SATANG } from './sale.domain'

const valid: ProductPack = { id: 0, barcode: '8850000000099', size: 6, priceSatang: null, isActive: true }

describe('packUnitPriceSatang', () => {
  test.each([
    [null, 9000],
    [8500, 8500],
    [0, 0],
  ])('pack price %p gives %p', (priceSatang, expected) => {
    expect(packUnitPriceSatang(1500, { size: 6, priceSatang })).toBe(expected)
  })
})

test('packUnitCostSatang multiplies the cost by the size', () => {
  expect(packUnitCostSatang(1000, 24)).toBe(24000)
})

describe('assertValidPack', () => {
  test.each<[string, Partial<ProductPack>]>([
    ['an empty barcode', { barcode: '' }],
    ['a barcode over 64 characters', { barcode: 'x'.repeat(65) }],
    ['size 1', { size: 1 }],
    ['size 10000', { size: 10000 }],
    ['a fractional size', { size: 2.5 }],
    ['a negative price', { priceSatang: -1 }],
    ['a price over the maximum', { priceSatang: MAX_AMOUNT_SATANG + 1 }],
  ])('rejects %s', (_label, overrides) => {
    try {
      assertValidPack({ ...valid, ...overrides })
      throw new Error('did not throw')
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError)
      expect((error as DomainError).code).toBe('INVALID_PRODUCT')
    }
  })

  test.each<[string, Partial<ProductPack>]>([
    ['size 2', { size: 2 }],
    ['size 9999', { size: 9999 }],
    ['a null price', { priceSatang: null }],
  ])('accepts %s', (_label, overrides) => {
    expect(() => assertValidPack({ ...valid, ...overrides })).not.toThrow()
  })
})
