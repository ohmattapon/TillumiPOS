import type { ProductPack } from '@pos/api/packs'
import type { Product } from '@pos/api/types'
import { describe, expect, test } from 'bun:test'
import { unitChoices } from './units'

const pack = (overrides: Partial<ProductPack> & { id: number; size: number }): ProductPack => ({
  barcode: `PACK-${overrides.id}`,
  priceSatang: null,
  isActive: true,
  ...overrides,
})

const product = (overrides: Partial<Product>): Product => ({
  id: 1,
  sku: 'SKU-1',
  barcode: null,
  name: 'น้ำดื่ม',
  productType: 'normal',
  categoryId: null,
  priceSatang: 700,
  costSatang: 500,
  trackStock: true,
  stockQty: 100,
  isActive: true,
  imageUrl: null,
  packs: [],
  ...overrides,
})

describe('unitChoices', () => {
  test('a product without packs offers single pieces only', () => {
    const choices = unitChoices(product({}))

    expect(choices).toEqual([{ packId: undefined, size: 1, unitPriceSatang: 700, shortOfStock: false }])
  })

  test('a product with packs offers pieces first, then the packs from the smallest up', () => {
    const choices = unitChoices(product({
      packs: [pack({ id: 7, size: 24 }), pack({ id: 5, size: 12 })],
    }))

    expect(choices.map((choice) => [choice.packId, choice.size])).toEqual([[undefined, 1], [5, 12], [7, 24]])
  })

  test('a pack without its own price costs the size times the piece price', () => {
    const choices = unitChoices(product({ packs: [pack({ id: 5, size: 12 })] }))

    expect(choices[1].unitPriceSatang).toBe(8400)
  })

  test('a pack with its own price uses it', () => {
    const choices = unitChoices(product({ packs: [pack({ id: 5, size: 12, priceSatang: 7500 })] }))

    expect(choices[1].unitPriceSatang).toBe(7500)
  })

  test('a disabled pack is not offered', () => {
    const choices = unitChoices(product({ packs: [pack({ id: 5, size: 12, isActive: false })] }))

    expect(choices).toHaveLength(1)
  })

  test('a pack the stock cannot fill is offered but flagged', () => {
    const choices = unitChoices(product({ stockQty: 20, packs: [pack({ id: 5, size: 12 }), pack({ id: 7, size: 24 })] }))

    expect(choices.map((choice) => [choice.size, choice.shortOfStock])).toEqual([[1, false], [12, false], [24, true]])
  })

  test('a product that does not track stock never runs short', () => {
    const choices = unitChoices(product({ trackStock: false, stockQty: 0, packs: [pack({ id: 5, size: 12 })] }))

    expect(choices.map((choice) => choice.shortOfStock)).toEqual([false, false])
  })

  test('single pieces run short when nothing is left', () => {
    const choices = unitChoices(product({ stockQty: 0 }))

    expect(choices[0].shortOfStock).toBe(true)
  })
})
