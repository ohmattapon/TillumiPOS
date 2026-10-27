import type { Product } from '@pos/api/types'
import { describe, expect, test } from 'bun:test'
import { matchScan } from './scan'

const product = (overrides: Partial<Product>): Product => ({
  id: 1,
  sku: 'SKU-1',
  barcode: null,
  name: 'ชา',
  productType: 'normal',
  categoryId: null,
  priceSatang: 2500,
  costSatang: 1500,
  trackStock: true,
  stockQty: 10,
  isActive: true,
  imageUrl: null,
  packs: [],
  ...overrides,
})

const exact = (...items: Product[]) => ({ items, total: items.length })

describe('matchScan', () => {
  test('a product barcode sells the product itself', () => {
    const tea = product({ id: 1, barcode: '8850001' })
    const box = product({ id: 2, sku: 'BOX', packs: [{ id: 5, barcode: '8850001-CASE', size: 12, priceSatang: null, isActive: true }] })

    const match = matchScan('8850001', exact(tea, box))

    expect(match).toMatchObject({ kind: 'product', product: { id: 1 } })
  })

  test('a pack barcode sells the pack, not the pieces the product is also sold in', () => {
    const tea = product({ id: 1, barcode: '8850001', packs: [{ id: 5, barcode: '8850001-CASE', size: 12, priceSatang: null, isActive: true }] })

    const match = matchScan('8850001-CASE', exact(tea))

    expect(match).toMatchObject({ kind: 'pack', product: { id: 1 }, pack: { id: 5, size: 12 } })
  })

  test('an inactive pack stops: the code never falls back to selling pieces', () => {
    const tea = product({ id: 1, barcode: '8850001', packs: [{ id: 5, barcode: '8850001-CASE', size: 12, priceSatang: null, isActive: false }] })

    const match = matchScan('8850001-CASE', exact(tea))

    expect(match).toMatchObject({ kind: 'inactivePack', pack: { id: 5 } })
  })

  test('a SKU is matched whatever the case typed', () => {
    const match = matchScan('sku-1', exact(product({ id: 1 })))

    expect(match).toMatchObject({ kind: 'product', product: { id: 1 } })
  })

  test('a code that matches nothing sells the only product the search found', () => {
    const match = matchScan('ชาเขียว', { items: [product({ id: 3, name: 'ชาเขียว' })], total: 1 })

    expect(match).toMatchObject({ kind: 'product', product: { id: 3 } })
  })

  test('a code that matches nothing among several results sells nothing', () => {
    expect(matchScan('ชา', { items: [product({ id: 3 }), product({ id: 4 })], total: 2 })).toEqual({ kind: 'none' })
  })

  test('an empty code sells nothing', () => {
    expect(matchScan('   ', exact(product({ id: 1 })))).toEqual({ kind: 'none' })
  })
})
