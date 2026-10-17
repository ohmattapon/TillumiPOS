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
  packs: [],
  ...overrides,
})

const catalogue = (...items: Product[]) => new Map(items.map((item) => [item.id, item]))

describe('priceCart', () => {
  const tea = product({ id: 1, priceSatang: 2500 })
  const cake = product({ id: 2, name: 'เค้ก', priceSatang: 5700, stockQty: 3 })

  test('prices lines, counts items and totals the cart', () => {
    const cart = priceCart(
      [
        { key: '1:', productId: 1, optionIds: [], packId: null, quantity: 2 },
        { key: '2:', productId: 2, optionIds: [], packId: null, quantity: 1 },
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

  test('a line that is not on an order yet has nothing sent and no note', () => {
    const cart = priceCart([{ key: '1:', productId: 1, optionIds: [], packId: null, quantity: 1 }], catalogue(tea), '', inclusive)

    expect(cart.lines[0]).toMatchObject({ sentQuantity: 0, note: null })
  })

  test('applies a discount typed in the shop currency', () => {
    const cart = priceCart([{ key: '1:', productId: 1, optionIds: [], packId: null, quantity: 2 }], catalogue(tea), '7.50', inclusive)

    expect(cart).toMatchObject({ discountSatang: 750, totalSatang: 4250, isDiscountValid: true })
  })

  test('a discount above the subtotal is invalid, ignored in the total, and blocks payment', () => {
    const cart = priceCart([{ key: '1:', productId: 1, optionIds: [], packId: null, quantity: 1 }], catalogue(tea), '25.01', inclusive)

    expect(cart).toMatchObject({ isDiscountValid: false, discountSatang: 0, totalSatang: 2500, canPay: false })
  })

  test.each(['abc', '-5', '1,2,x'])('a discount of %p is invalid', (discount) => {
    expect(priceCart([{ key: '1:', productId: 1, optionIds: [], packId: null, quantity: 1 }], catalogue(tea), discount, inclusive).isDiscountValid).toBe(false)
  })

  test('a discount that makes the sale free cannot be paid', () => {
    const cart = priceCart([{ key: '1:', productId: 1, optionIds: [], packId: null, quantity: 1 }], catalogue(tea), '25', inclusive)

    expect(cart).toMatchObject({ isDiscountValid: true, totalSatang: 0, canPay: false })
  })

  test('a line over the stock is flagged and blocks payment', () => {
    const cart = priceCart(
      [
        { key: '1:', productId: 1, optionIds: [], packId: null, quantity: 1 },
        { key: '2:', productId: 2, optionIds: [], packId: null, quantity: 4 },
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
        { key: '2:', productId: 2, optionIds: [], packId: null, quantity: 3 },
        { key: '3:', productId: 3, optionIds: [], packId: null, quantity: 50 },
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
        { key: '1:', productId: 1, optionIds: [], packId: null, quantity: 1 },
        { key: '99:', productId: 99, optionIds: [], packId: null, quantity: 5 },
      ],
      catalogue(tea),
      '',
      inclusive,
    )

    expect(cart.lines).toHaveLength(1)
    expect(cart).toMatchObject({ itemCount: 1, subtotalSatang: 2500 })
  })

  test('uses the current price, so a repriced product changes the cart', () => {
    const lines = [{ key: '1:', productId: 1, optionIds: [], packId: null, quantity: 2 }]

    const before = priceCart(lines, catalogue(tea), '', inclusive)
    const after = priceCart(lines, catalogue({ ...tea, priceSatang: 3000 }), '', inclusive)

    expect(before.totalSatang).toBe(5000)
    expect(after.totalSatang).toBe(6000)
  })
})

describe('priceCart: VAT', () => {
  const tea = product({ id: 1, priceSatang: 10_000 })
  const one = [{ key: '1:', productId: 1, optionIds: [], packId: null, quantity: 1 }]

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
    lineId: 1,
    productId: 1,
    productName: 'ชา',
    sku: 'SKU-1',
    unitPriceSatang: 2500,
    quantity: 2,
    lineTotalSatang: 5000,
    options: [],
    note: null,
    sentQuantity: 0,
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

  test('carries how many units the kitchen has and the note of each line', () => {
    const cart = priceOrder(
      [item({ lineId: 1, sentQuantity: 2, note: 'ไม่ใส่น้ำแข็ง' }), item({ lineId: 2 })],
      catalogue(product({ id: 1 })),
      '',
      inclusive,
    )

    expect(cart.lines[0]).toMatchObject({ sentQuantity: 2, note: 'ไม่ใส่น้ำแข็ง' })
    expect(cart.lines[1]).toMatchObject({ sentQuantity: 0, note: null })
  })
})

describe('options on a line', () => {
  const tea = product({ id: 1, priceSatang: 5000, stockQty: 4 })
  const catalogue = (...items: Product[]) => new Map(items.map((entry) => [entry.id, entry]))
  const optionsById = new Map([
    [20, { id: 20, name: 'ไข่มุก', priceSatang: 1000 }],
    [21, { id: 21, name: 'วุ้น', priceSatang: 500 }],
  ])

  test('a line is priced at the product plus its options, and lists them', () => {
    const cart = priceCart(
      [{ key: '1:20-21', productId: 1, optionIds: [20, 21], packId: null, quantity: 2 }],
      catalogue(tea),
      '',
      inclusive,
      optionsById,
    )

    expect(cart.lines[0]).toMatchObject({
      unitPriceSatang: 6500,
      lineTotalSatang: 13000,
      lineKey: '1:20-21',
      lineId: null,
      options: [
        { name: 'ไข่มุก', priceSatang: 1000 },
        { name: 'วุ้น', priceSatang: 500 },
      ],
      optionIds: [20, 21],
      unavailable: false,
    })
    expect(cart.totalSatang).toBe(13000)
  })

  test('two lines of one product share its stock', () => {
    const cart = priceCart(
      [
        { key: '1:20', productId: 1, optionIds: [20], packId: null, quantity: 3 },
        { key: '1:', productId: 1, optionIds: [], packId: null, quantity: 2 },
      ],
      catalogue(tea),
      '',
      inclusive,
      optionsById,
    )

    expect(cart.lines.map((line) => line.exceedsStock)).toEqual([true, true])
    expect(cart.canPay).toBe(false)
  })

  test('an option that is no longer offered blocks payment instead of silently charging less', () => {
    const cart = priceCart(
      [{ key: '1:99', productId: 1, optionIds: [99], packId: null, quantity: 1 }],
      catalogue(tea),
      '',
      inclusive,
      optionsById,
    )

    expect(cart.lines[0]).toMatchObject({ unavailable: true })
    expect(cart.canPay).toBe(false)
  })

  test('an order line is priced as quoted, with the options it kept', () => {
    const cart = priceOrder(
      [
        {
          lineId: 9,
          productId: 1,
          productName: 'ชา',
          sku: 'TEA',
          unitPriceSatang: 6000,
          quantity: 1,
          lineTotalSatang: 6000,
          options: [{ groupId: 2, groupName: 'ท็อปปิง', optionId: 20, name: 'ไข่มุก', priceSatang: 1000 }],
          note: null,
          sentQuantity: 0,
        },
      ],
      catalogue(tea),
      '',
      inclusive,
    )

    expect(cart.lines[0]).toMatchObject({
      lineId: 9,
      lineKey: '9',
      unitPriceSatang: 6000,
      options: [{ name: 'ไข่มุก', priceSatang: 1000 }],
      optionIds: [20],
    })
  })
})

describe('a promotion', () => {
  const tea = product({ id: 1, priceSatang: 2500 })
  const lines = [{ key: '1:', productId: 1, optionIds: [], packId: null, quantity: 2 }]
  const promotion = { id: 4, name: 'ลด 10%', discountSatang: 500 }

  test('sets the discount and is part of the total', () => {
    const cart = priceCart(lines, catalogue(tea), '', { ...inclusive, promotion })
    expect(cart).toMatchObject({ discountSatang: 500, totalSatang: 4500, promotion, isDiscountValid: true, canPay: true })
  })

  test('replaces whatever was typed in the discount field', () => {
    const cart = priceCart(lines, catalogue(tea), '99', { ...inclusive, promotion })
    expect(cart).toMatchObject({ discountSatang: 500, totalSatang: 4500, isDiscountValid: true })
  })

  test('never takes more than the subtotal', () => {
    const cart = priceCart(lines, catalogue(tea), '', { ...inclusive, promotion: { ...promotion, discountSatang: 9000 } })
    expect(cart).toMatchObject({ discountSatang: 5000, totalSatang: 0 })
  })

  test('without one nothing changes and promotion is null', () => {
    expect(priceCart(lines, catalogue(tea), '7.50', inclusive)).toMatchObject({ promotion: null, discountSatang: 750 })
  })

  test('an order is priced the same way, at the prices it quoted', () => {
    const items: Order['items'] = [
      { lineId: 1, productId: 1, productName: 'ชา', sku: 'TEA', unitPriceSatang: 2000, quantity: 2, lineTotalSatang: 4000, options: [], note: null, sentQuantity: 0 },
    ]
    const cart = priceOrder(items, catalogue(tea), '', { ...inclusive, promotion: { id: 4, name: 'ลด 10%', discountSatang: 400 } })
    expect(cart).toMatchObject({ subtotalSatang: 4000, discountSatang: 400, totalSatang: 3600 })
  })
})

describe('priceCart with packs', () => {
  const cola = product({ id: 1, name: 'Cola', priceSatang: 1500, stockQty: 12 })
  const withPack = (pack: Partial<Product['packs'][number]>, stock = 12) =>
    catalogue({ ...cola, stockQty: stock, packs: [{ id: 9, barcode: 'B', size: 6, priceSatang: null, isActive: true, ...pack }] })
  const lines = [
    { key: '1::p9', productId: 1, optionIds: [], packId: 9, quantity: 1 },
    { key: '1:', productId: 1, optionIds: [], packId: null, quantity: 6 },
  ]

  test('a pack with no price is size times the product price and counts its size against stock', () => {
    const cart = priceCart(lines, withPack({}), '', inclusive)
    expect(cart.lines.map((line) => line.unitPriceSatang)).toEqual([9000, 1500])
    expect(cart.lines[0]).toMatchObject({ packId: 9, packSize: 6 })
    expect(cart.lines[1]).toMatchObject({ packId: null, packSize: 1 })
    expect(cart.lines.some((line) => line.exceedsStock)).toBe(false)
    expect(cart.itemCount).toBe(7)
  })

  test('both lines exceed stock when the product cannot cover them together', () => {
    const cart = priceCart(lines, withPack({}, 11), '', inclusive)
    expect(cart.lines.map((line) => line.exceedsStock)).toEqual([true, true])
  })

  test('a pack with its own price uses it', () => {
    const cart = priceCart(lines, withPack({ priceSatang: 8500 }), '', inclusive)
    expect(cart.lines[0]?.unitPriceSatang).toBe(8500)
  })

  test('an inactive or missing pack blocks payment', () => {
    for (const catalogueWithPack of [withPack({ isActive: false }), catalogue(cola)]) {
      const cart = priceCart([lines[0]!], catalogueWithPack, '', inclusive)
      expect(cart.lines[0]?.unavailable).toBe(true)
      expect(cart.canPay).toBe(false)
    }
  })
})
