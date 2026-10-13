import type { Product } from '@pos/api/types'
import { describe, expect, test } from 'bun:test'
import { priceCart } from './cart'

const product = (overrides: Partial<Product>): Product => ({
  id: 1,
  sku: 'SKU-1',
  barcode: null,
  name: 'ชา',
  categoryId: null,
  priceSatang: 2500,
  costSatang: 1500,
  trackStock: true,
  stockQty: 10,
  isActive: true,
  imageUrl: null,
  ...overrides,
})

const catalogue = (...items: Product[]) => new Map(items.map((item) => [item.id, item]))

describe('priceCart', () => {
  const tea = product({ id: 1, priceSatang: 2500 })
  const cake = product({ id: 2, name: 'เค้ก', priceSatang: 5700, stockQty: 3 })

  test('prices lines, counts items and totals the cart', () => {
    const cart = priceCart(
      [
        { productId: 1, quantity: 2 },
        { productId: 2, quantity: 1 },
      ],
      catalogue(tea, cake),
      '',
    )

    expect(cart).toMatchObject({ itemCount: 3, subtotalSatang: 10700, discountSatang: 0, totalSatang: 10700, canPay: true })
    expect(cart.lines.map((line) => line.lineTotalSatang)).toEqual([5000, 5700])
  })

  test('an empty cart cannot be paid', () => {
    expect(priceCart([], catalogue(tea), '')).toMatchObject({ totalSatang: 0, canPay: false })
  })

  test('applies a discount typed in baht', () => {
    const cart = priceCart([{ productId: 1, quantity: 2 }], catalogue(tea), '7.50')

    expect(cart).toMatchObject({ discountSatang: 750, totalSatang: 4250, isDiscountValid: true })
  })

  test('a discount above the subtotal is invalid, ignored in the total, and blocks payment', () => {
    const cart = priceCart([{ productId: 1, quantity: 1 }], catalogue(tea), '25.01')

    expect(cart).toMatchObject({ isDiscountValid: false, discountSatang: 0, totalSatang: 2500, canPay: false })
  })

  test.each(['abc', '-5', '1,2,x'])('a discount of %p is invalid', (discount) => {
    expect(priceCart([{ productId: 1, quantity: 1 }], catalogue(tea), discount).isDiscountValid).toBe(false)
  })

  test('a discount that makes the sale free cannot be paid', () => {
    const cart = priceCart([{ productId: 1, quantity: 1 }], catalogue(tea), '25')

    expect(cart).toMatchObject({ isDiscountValid: true, totalSatang: 0, canPay: false })
  })

  test('a line over the stock is flagged and blocks payment', () => {
    const cart = priceCart(
      [
        { productId: 1, quantity: 1 },
        { productId: 2, quantity: 4 },
      ],
      catalogue(tea, cake),
      '',
    )

    expect(cart.lines.map((line) => line.exceedsStock)).toEqual([false, true])
    expect(cart.canPay).toBe(false)
  })

  test('selling exactly the stock is allowed, and untracked products have no limit', () => {
    const service = product({ id: 3, trackStock: false, stockQty: 0 })

    const cart = priceCart(
      [
        { productId: 2, quantity: 3 },
        { productId: 3, quantity: 50 },
      ],
      catalogue(cake, service),
      '',
    )

    expect(cart.canPay).toBe(true)
  })

  test('a product that is no longer in the catalogue is left out, not charged at an old price', () => {
    const cart = priceCart(
      [
        { productId: 1, quantity: 1 },
        { productId: 99, quantity: 5 },
      ],
      catalogue(tea),
      '',
    )

    expect(cart.lines).toHaveLength(1)
    expect(cart).toMatchObject({ itemCount: 1, subtotalSatang: 2500 })
  })

  test('uses the current price, so a repriced product changes the cart', () => {
    const lines = [{ productId: 1, quantity: 2 }]

    const before = priceCart(lines, catalogue(tea), '')
    const after = priceCart(lines, catalogue({ ...tea, priceSatang: 3000 }), '')

    expect(before.totalSatang).toBe(5000)
    expect(after.totalSatang).toBe(6000)
  })
})
