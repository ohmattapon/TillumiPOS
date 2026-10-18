import { expect, test } from 'bun:test'
import { promotionLines } from './promotion-lines'

test('each line carries its product category and its total, and a product with no category has null', () => {
  const categories = new Map([[1, { categoryId: 4 }], [2, { categoryId: null }]])
  expect(promotionLines([
    { productId: 1, lineTotalSatang: 6000 },
    { productId: 2, lineTotalSatang: 4000 },
  ], categories)).toEqual([
    { productId: 1, categoryId: 4, lineTotalSatang: 6000 },
    { productId: 2, categoryId: null, lineTotalSatang: 4000 },
  ])
})

test('a product not loaded yet has no category, so only a product scope can match it', () => {
  expect(promotionLines([{ productId: 9, lineTotalSatang: 100 }], new Map())).toEqual([{ productId: 9, categoryId: null, lineTotalSatang: 100 }])
})
