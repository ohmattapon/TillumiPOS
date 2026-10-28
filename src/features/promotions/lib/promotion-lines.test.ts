import { expect, test } from 'bun:test'
import { promotionLines } from './promotion-lines'

test('each line carries its product category and its total, and a product with no category has null', () => {
  const categories = new Map([[1, { categoryId: 4 }], [2, { categoryId: null }]])
  expect(promotionLines([
    { productId: 1, unitPriceSatang: 3000, quantity: 2, packId: null, lineTotalSatang: 6000 },
    { productId: 2, unitPriceSatang: 4000, quantity: 1, packId: null, lineTotalSatang: 4000 },
  ], categories)).toEqual([
    { productId: 1, categoryId: 4, unitPriceSatang: 3000, quantity: 2, isPack: false, lineTotalSatang: 6000 },
    { productId: 2, categoryId: null, unitPriceSatang: 4000, quantity: 1, isPack: false, lineTotalSatang: 4000 },
  ])
})

test('a product not loaded yet has no category, so only a product scope can match it', () => {
  expect(
    promotionLines([{ productId: 9, unitPriceSatang: 100, quantity: 1, packId: null, lineTotalSatang: 100 }], new Map()),
  ).toEqual([{ productId: 9, categoryId: null, unitPriceSatang: 100, quantity: 1, isPack: false, lineTotalSatang: 100 }])
})

test('a pack line keeps its own price and counts as one line, never as its pack size', () => {
  const categories = new Map([[3, { categoryId: 1 }]])
  expect(
    promotionLines([{ productId: 3, unitPriceSatang: 10000, quantity: 2, packId: 5, lineTotalSatang: 20000 }], categories),
  ).toEqual([{ productId: 3, categoryId: 1, unitPriceSatang: 10000, quantity: 2, isPack: true, lineTotalSatang: 20000 }])
})
