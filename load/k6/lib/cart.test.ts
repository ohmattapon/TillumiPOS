import { describe, expect, test } from 'bun:test'
import { mulberry32 } from './prng'
import { pickCart } from './cart'

const seed = { productIds: Array.from({ length: 200 }, (_, index) => 1000 + index), hotProductIds: [1, 2, 3, 4, 5], memberIds: [7, 8, 9] }

describe('pickCart', () => {
  test('is the same for the same random sequence', () => {
    expect(pickCart(mulberry32(5), seed)).toEqual(pickCart(mulberry32(5), seed))
  })

  test('gives one to four lines of distinct ordinary products with a quantity of one to three', () => {
    const next = mulberry32(99)
    for (let index = 0; index < 500; index++) {
      const cart = pickCart(next, seed)
      expect(cart.items.length).toBeGreaterThanOrEqual(1)
      expect(cart.items.length).toBeLessThanOrEqual(4)
      expect(new Set(cart.items.map((item) => item.productId)).size).toBe(cart.items.length)
      for (const item of cart.items) {
        expect(seed.productIds).toContain(item.productId)
        expect(item.quantity).toBeGreaterThanOrEqual(1)
        expect(item.quantity).toBeLessThanOrEqual(3)
      }
    }
  })

  test('never takes a hot product, which is kept for the contention scenario', () => {
    const next = mulberry32(3)
    for (let index = 0; index < 500; index++)
      for (const item of pickCart(next, seed).items) expect(seed.hotProductIds).not.toContain(item.productId)
  })

  test('reaches many different carts', () => {
    const next = mulberry32(11)
    const carts = new Set(Array.from({ length: 200 }, () => JSON.stringify(pickCart(next, seed).items)))
    expect(carts.size).toBeGreaterThan(150)
  })

  test('refuses a seed with no ordinary products', () => {
    expect(() => pickCart(mulberry32(1), { ...seed, productIds: [] })).toThrow()
  })
})
