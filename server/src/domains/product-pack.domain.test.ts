import { describe, expect, test } from 'bun:test'
import { DomainError } from './errors/domain-error'
import { MAX_AMOUNT_SATANG } from './sale.domain'
import {
  MAX_PACK_SIZE,
  MAX_PACKS_PER_PRODUCT,
  assertPackHasNoOptions,
  assertValidPack,
  packUnitCostSatang,
  packUnitPriceSatang,
  type ProductPack,
} from './product-pack'

const pack = (overrides: Partial<ProductPack> = {}): ProductPack => ({
  id: 1,
  barcode: '885000000001',
  size: 12,
  priceSatang: null,
  isActive: true,
  ...overrides,
})

const codeOf = (run: () => unknown) => {
  try {
    run()
  } catch (error) {
    return (error as DomainError).code
  }
  return undefined
}

describe('assertValidPack', () => {
  test('accepts a valid pack', () => {
    expect(codeOf(() => assertValidPack(pack()))).toBeUndefined()
  })

  test('rejects an empty or overlong barcode', () => {
    expect(codeOf(() => assertValidPack(pack({ barcode: '' })))).toBe('INVALID_PRODUCT')
    expect(codeOf(() => assertValidPack(pack({ barcode: 'x'.repeat(65) })))).toBe('INVALID_PRODUCT')
  })

  test('rejects a size outside 2..MAX_PACK_SIZE', () => {
    for (const size of [0, 1, 1.5, MAX_PACK_SIZE + 1]) {
      expect(codeOf(() => assertValidPack(pack({ size })))).toBe('INVALID_PRODUCT')
    }
  })

  test('rejects a negative or overlarge pack price', () => {
    expect(codeOf(() => assertValidPack(pack({ priceSatang: -1 })))).toBe('INVALID_PRODUCT')
    expect(codeOf(() => assertValidPack(pack({ priceSatang: MAX_AMOUNT_SATANG + 1 })))).toBe('INVALID_PRODUCT')
    expect(codeOf(() => assertValidPack(pack({ priceSatang: 10.5 })))).toBe('INVALID_PRODUCT')
  })
})

describe('assertPackHasNoOptions', () => {
  test('rejects options on a pack line', () => {
    expect(codeOf(() => assertPackHasNoOptions(true, 1))).toBe('PACK_WITH_OPTIONS')
  })

  test('accepts a pack line without options and any piece line', () => {
    expect(codeOf(() => assertPackHasNoOptions(true, 0))).toBeUndefined()
    expect(codeOf(() => assertPackHasNoOptions(false, 2))).toBeUndefined()
  })
})

describe('packUnitPriceSatang', () => {
  test('uses the explicit pack price when set', () => {
    expect(packUnitPriceSatang(100, { size: 12, priceSatang: 1000 })).toBe(1000)
  })

  test('falls back to size times the product price', () => {
    expect(packUnitPriceSatang(100, { size: 12, priceSatang: null })).toBe(1200)
  })
})

describe('packUnitCostSatang', () => {
  test('multiplies the product cost by size', () => {
    expect(packUnitCostSatang(50, 12)).toBe(600)
  })

  test('rejects a pieces cost above the maximum amount', () => {
    expect(codeOf(() => packUnitCostSatang(MAX_AMOUNT_SATANG, 2))).toBe('AMOUNT_TOO_LARGE')
  })
})

describe('pack limits', () => {
  test('documents the supported bounds', () => {
    expect(MAX_PACK_SIZE).toBe(9999)
    expect(MAX_PACKS_PER_PRODUCT).toBe(10)
  })
})
