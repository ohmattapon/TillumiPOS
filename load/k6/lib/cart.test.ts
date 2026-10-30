import { describe, expect, test } from 'bun:test'
import { mulberry32 } from './prng'
import { pickCart, pickExtraProduct } from './cart'

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

describe('pickExtraProduct', () => {
  test('never returns a product already in the cart, even when only one is left', () => {
    const tiny = { productIds: [1, 2, 3] }
    const next = mulberry32(8)
    for (let index = 0; index < 200; index++) {
      const cart = { items: [{ productId: 1, quantity: 1 }, { productId: 3, quantity: 2 }] }
      expect(pickExtraProduct(next, tiny, cart)).toBe(2)
    }
  })

  test('is repeatable and draws from the whole pool outside the cart', () => {
    const cart = pickCart(mulberry32(4), seed)
    expect(pickExtraProduct(mulberry32(9), seed, cart)).toBe(pickExtraProduct(mulberry32(9), seed, cart))
    const next = mulberry32(2)
    const drawn = new Set(Array.from({ length: 300 }, () => pickExtraProduct(next, seed, cart)))
    expect(drawn.size).toBeGreaterThan(100)
  })

  test('refuses when the cart holds every product', () => {
    expect(() => pickExtraProduct(mulberry32(1), { productIds: [1] }, { items: [{ productId: 1, quantity: 1 }] })).toThrow()
  })
})
