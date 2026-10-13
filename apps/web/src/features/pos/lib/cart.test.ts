import type { Order, Product } from '@pos/api/types'
import { describe, expect, test } from 'bun:test'
import { createMoney } from '@/lib/money'
import { priceCart, priceOrder, type PricingOptions } from './cart'

const baht = createMoney('THB', 'th')
const inclusive: PricingOptions = { vatMode: 'inclusive', vatRateBp: 700, parseAmount: baht.parse }

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
      inclusive,
    )

    expect(cart).toMatchObject({ itemCount: 3, subtotalSatang: 10700, discountSatang: 0, totalSatang: 10700, canPay: true })
    expect(cart.lines.map((line) => line.lineTotalSatang)).toEqual([5000, 5700])
  })

  test('an empty cart cannot be paid', () => {
    expect(priceCart([], catalogue(tea), '', inclusive)).toMatchObject({ totalSatang: 0, canPay: false })
  })

  test('applies a discount typed in the shop currency', () => {
    const cart = priceCart([{ productId: 1, quantity: 2 }], catalogue(tea), '7.50', inclusive)

    expect(cart).toMatchObject({ discountSatang: 750, totalSatang: 4250, isDiscountValid: true })
  })

  test('a discount above the subtotal is invalid, ignored in the total, and blocks payment', () => {
    const cart = priceCart([{ productId: 1, quantity: 1 }], catalogue(tea), '25.01', inclusive)

    expect(cart).toMatchObject({ isDiscountValid: false, discountSatang: 0, totalSatang: 2500, canPay: false })
  })

  test.each(['abc', '-5', '1,2,x'])('a discount of %p is invalid', (discount) => {
    expect(priceCart([{ productId: 1, quantity: 1 }], catalogue(tea), discount, inclusive).isDiscountValid).toBe(false)
  })

  test('a discount that makes the sale free cannot be paid', () => {
    const cart = priceCart([{ productId: 1, quantity: 1 }], catalogue(tea), '25', inclusive)

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
      inclusive,
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
      inclusive,
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
      inclusive,
    )

    expect(cart.lines).toHaveLength(1)
    expect(cart).toMatchObject({ itemCount: 1, subtotalSatang: 2500 })
  })

  test('uses the current price, so a repriced product changes the cart', () => {
    const lines = [{ productId: 1, quantity: 2 }]

    const before = priceCart(lines, catalogue(tea), '', inclusive)
    const after = priceCart(lines, catalogue({ ...tea, priceSatang: 3000 }), '', inclusive)

    expect(before.totalSatang).toBe(5000)
    expect(after.totalSatang).toBe(6000)
  })
})

describe('priceCart: VAT', () => {
  const tea = product({ id: 1, priceSatang: 10_000 })
  const one = [{ productId: 1, quantity: 1 }]

  test('inclusive: VAT is inside the price, so the total is the price', () => {
    expect(priceCart(one, catalogue(tea), '', inclusive)).toMatchObject({ vatSatang: 654, totalSatang: 10_000 })
  })

  test('exclusive: VAT is added on top of the price', () => {
    const cart = priceCart(one, catalogue(tea), '', { ...inclusive, vatMode: 'exclusive' })

    expect(cart).toMatchObject({ subtotalSatang: 10_000, vatSatang: 700, totalSatang: 10_700 })
  })

  test('exclusive: the discount comes off before VAT is added', () => {
    const cart = priceCart(one, catalogue(tea), '10', { ...inclusive, vatMode: 'exclusive' })

    expect(cart).toMatchObject({ discountSatang: 1000, vatSatang: 630, totalSatang: 9_630 })
  })

  test('none: no VAT at all', () => {
    expect(priceCart(one, catalogue(tea), '', { ...inclusive, vatMode: 'none' })).toMatchObject({
      vatSatang: 0,
      totalSatang: 10_000,
    })
  })

  test('the total always matches what the shared pricing rule gives the server', async () => {
    const { calculateTotals } = await import('@pos/api/pricing')
    const cart = priceCart(one, catalogue(tea), '3.33', { ...inclusive, vatMode: 'exclusive', vatRateBp: 1000 })

    expect(cart.totalSatang).toBe(
      calculateTotals({ subtotalSatang: 10_000, discountSatang: 333, vatMode: 'exclusive', vatRateBp: 1000 })
        .totalSatang,
    )
  })

  test('a currency without minor units parses the discount as whole amounts', () => {
    const yen = createMoney('JPY', 'en')
    const cart = priceCart(one, catalogue(tea), '500', { ...inclusive, vatMode: 'none', parseAmount: yen.parse })

    expect(cart).toMatchObject({ discountSatang: 500, totalSatang: 9_500 })
  })
})

describe('priceOrder', () => {
  const item = (overrides: Partial<Order['items'][number]> = {}): Order['items'][number] => ({
    productId: 1,
    productName: 'ชา',
    sku: 'SKU-1',
    unitPriceSatang: 2500,
    quantity: 2,
    lineTotalSatang: 5000,
    ...overrides,
  })
  const catalogue = (...items: Product[]) => new Map(items.map((entry) => [entry.id, entry]))

  test('charges the price the order quoted, even when the menu price has changed since', () => {
    const repriced = product({ id: 1, priceSatang: 9900 })

    const cart = priceOrder([item()], catalogue(repriced), '', inclusive)

    expect(cart.lines[0]).toMatchObject({ unitPriceSatang: 2500, lineTotalSatang: 5000 })
    expect(cart).toMatchObject({ subtotalSatang: 5000, totalSatang: 5000, canPay: true })
  })

  test('keeps a line whose product is no longer in the catalogue (it was ordered, and is still owed)', () => {
    const cart = priceOrder([item({ productId: 99, productName: 'เมนูเก่า' })], catalogue(), '', inclusive)

    expect(cart.lines.map((line) => line.name)).toEqual(['เมนูเก่า'])
    expect(cart.canPay).toBe(true)
  })

  test('warns when the shelf has less than the order asks for, and blocks payment', () => {
    const cart = priceOrder([item({ quantity: 5 })], catalogue(product({ id: 1, stockQty: 3 })), '', inclusive)

    expect(cart.lines[0]).toMatchObject({ exceedsStock: true, stockQty: 3 })
    expect(cart.canPay).toBe(false)
  })

  test('applies a discount and VAT like the one-step cart', () => {
    const cart = priceOrder([item()], catalogue(product({ id: 1 })), '10', { ...inclusive, vatMode: 'exclusive' })

    expect(cart).toMatchObject({ discountSatang: 1000, vatSatang: 280, totalSatang: 4280 })
  })

  test('an order with nothing on it cannot be paid', () => {
    expect(priceOrder([], catalogue(), '', inclusive)).toMatchObject({ totalSatang: 0, canPay: false })
  })
})
