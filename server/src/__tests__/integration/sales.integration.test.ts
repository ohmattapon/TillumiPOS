import { beforeEach, describe, expect, test } from 'bun:test'
import { ok, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session
let cashier: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
  cashier = await signIn('cashier')
})

const cash = (amountSatang: number) => [{ method: 'cash' as const, amountSatang }]
const stockOf = async (id: number) => ok(await owner.api.catalog.products({ id }).get()).stockQty
const allSales = async () => ok(await owner.api.sales.get({ query: {} })).items

describe('completing a sale', () => {
  test('computes totals, VAT and change, deducts stock and records the movements', async () => {
    const tea = await seedProduct(owner, { name: 'Tea', priceSatang: 2500, stock: 10 })
    const cake = await seedProduct(owner, { name: 'Cake', priceSatang: 5700, stock: 5 })

    const sale = ok(
      await cashier.api.sales.post({
        items: [
          { productId: tea.id, quantity: 2 },
          { productId: cake.id, quantity: 1 },
        ],
        discountSatang: 700,
        payments: cash(20000),
      }),
    )

    expect(sale).toMatchObject({
      status: 'completed',
      subtotalSatang: 10700,
      discountSatang: 700,
      totalSatang: 10000,
      vatSatang: 654, // 10000 * 7 / 107 = 654.2
      paidSatang: 20000,
      changeSatang: 10000,
      cashierId: cashier.user.id,
      cashierName: 'cashier',
    })
    expect(sale.receiptNo).toMatch(/^MAIN-\d{8}-00001$/)
    expect(sale.items).toEqual([
      { productId: tea.id, productName: 'Tea', sku: tea.sku, unitPriceSatang: 2500, quantity: 2, lineTotalSatang: 5000, options: [], packId: null, packSize: 1 },
      { productId: cake.id, productName: 'Cake', sku: cake.sku, unitPriceSatang: 5700, quantity: 1, lineTotalSatang: 5700, options: [], packId: null, packSize: 1 },
    ])
    expect(sale.payments).toEqual(cash(20000))

    expect(await stockOf(tea.id)).toBe(8)
    expect(await stockOf(cake.id)).toBe(4)
    const [latest] = ok(await owner.api.inventory.movements.get({ query: { productId: tea.id } })).items
    expect(latest).toMatchObject({ type: 'sale', quantity: -2, balanceAfter: 8, reference: sale.receiptNo })
  })

  test('repeated lines for one product are merged, keeping first-seen order', async () => {
    const tea = await seedProduct(owner, { priceSatang: 1000, stock: 10 })
    const cake = await seedProduct(owner, { priceSatang: 2000, stock: 10 })

    const sale = ok(
      await cashier.api.sales.post({
        items: [
          { productId: tea.id, quantity: 1 },
          { productId: cake.id, quantity: 1 },
          { productId: tea.id, quantity: 2 },
        ],
        payments: cash(5000),
      }),
    )

    expect(sale.items.map((item) => [item.productId, item.quantity])).toEqual([
      [tea.id, 3],
      [cake.id, 1],
    ])
    expect(await stockOf(tea.id)).toBe(7)
  })

  test('a receipt keeps the name and price from the moment of sale', async () => {
    const tea = await seedProduct(owner, { name: 'Tea', priceSatang: 2500, stock: 10 })
    const sale = ok(
      await cashier.api.sales.post({ items: [{ productId: tea.id, quantity: 1 }], payments: cash(2500) }),
    )

    ok(await owner.api.catalog.products({ id: tea.id }).patch({ name: 'Green tea', priceSatang: 9900 }))

    const stored = ok(await owner.api.sales({ id: sale.id }).get())
    expect(stored.items[0]).toMatchObject({ productName: 'Tea', unitPriceSatang: 2500, lineTotalSatang: 2500 })
    expect(stored.totalSatang).toBe(2500)
  })

  test('a receipt keeps the shop details from the moment of sale, with no branch line', async () => {
    ok(await owner.api.settings.patch({ shopName: 'ร้านสมชาย', taxId: '0105500000000', address: 'สำนักงานใหญ่', phone: '020000000' }))
    const tea = await seedProduct(owner, { name: 'Tea', priceSatang: 2500, stock: 10 })
    const sale = ok(
      await cashier.api.sales.post({ items: [{ productId: tea.id, quantity: 1 }], payments: cash(2500) }),
    )
    const heading = {
      shopName: 'ร้านสมชาย',
      shopTaxId: '0105500000000',
      // New receipts carry no branch line; the shop's details are printed.
      branchName: null,
      shopAddress: 'สำนักงานใหญ่',
      shopPhone: '020000000',
    }
    expect(sale).toMatchObject(heading)

    ok(await owner.api.settings.patch({ shopName: 'ร้านใหม่', taxId: null, address: 'ที่อยู่ใหม่', phone: null }))

    const stored = ok(await owner.api.sales({ id: sale.id }).get())
    expect(stored).toMatchObject({ ...heading, branchName: sale.branchName })
    expect((await allSales())[0]).toMatchObject({ shopName: 'ร้านสมชาย', branchName: sale.branchName })

    const next = ok(await cashier.api.sales.post({ items: [{ productId: tea.id, quantity: 1 }], payments: cash(2500) }))
    expect(next).toMatchObject({
      shopName: 'ร้านใหม่',
      shopTaxId: null,
      branchName: null,
      shopAddress: 'ที่อยู่ใหม่',
      shopPhone: null,
    })
  })

  test('receipt numbers stay consecutive across a failed sale', async () => {
    const tea = await seedProduct(owner, { stock: 2 })
    const sell = (quantity: number) =>
      cashier.api.sales.post({ items: [{ productId: tea.id, quantity }], payments: cash(100000) })

    const first = ok(await sell(1))
    expect((await sell(50)).status).toBe(409)
    const second = ok(await sell(1))

    const [, firstDay, firstNumber] = first.receiptNo.split('-')
    const [, secondDay, secondNumber] = second.receiptNo.split('-')
    // The counter restarts each business day; only compare within one day.
    if (firstDay === secondDay) expect(Number(secondNumber)).toBe(Number(firstNumber) + 1)
    else expect(secondNumber).toBe('00001')
  })

  test('a split payment that adds up exactly leaves no change', async () => {
    const tea = await seedProduct(owner, { priceSatang: 10000, stock: 1 })

    const sale = ok(
      await cashier.api.sales.post({
        items: [{ productId: tea.id, quantity: 1 }],
        payments: [
          { method: 'promptpay', amountSatang: 6000 },
          { method: 'cash', amountSatang: 4000 },
        ],
      }),
    )

    expect(sale).toMatchObject({ paidSatang: 10000, changeSatang: 0 })
    expect(sale.payments).toHaveLength(2)
  })

  test('products that do not track stock sell without limit and leave no movement', async () => {
    const service = await seedProduct(owner, { trackStock: false, priceSatang: 100 })

    ok(await cashier.api.sales.post({ items: [{ productId: service.id, quantity: 999 }], payments: cash(99900) }))

    expect(await stockOf(service.id)).toBe(0)
    expect(ok(await owner.api.inventory.movements.get({ query: { productId: service.id } })).items).toHaveLength(0)
  })
})

describe('selling a pack', () => {
  test('takes the pieces of the pack out of stock, puts them back on void, and keeps the sold pack', async () => {
    const water = await seedProduct(owner, {
      priceSatang: 1500,
      costSatang: 1000,
      packs: [{ barcode: 'BOX6', size: 6, priceSatang: 8500 }],
    })
    ok(await owner.api.inventory.receive.post({ productId: water.id, quantity: 24 }))
    const packId = water.packs[0]!.id

    const sale = ok(await cashier.api.sales.post({ items: [{ productId: water.id, packId, quantity: 1 }], payments: cash(8500) }))

    expect(sale.items).toEqual([
      expect.objectContaining({ productId: water.id, packId, packSize: 6, quantity: 1, unitPriceSatang: 8500, lineTotalSatang: 8500 }),
    ])
    expect(await stockOf(water.id)).toBe(18)
    const [movement] = ok(await owner.api.inventory.movements.get({ query: { productId: water.id } })).items
    expect(movement).toMatchObject({ type: 'sale', quantity: -6, balanceAfter: 18, reference: sale.receiptNo })

    ok(await owner.api.sales({ id: sale.id }).void.post({ reason: 'mistake' }))
    expect(await stockOf(water.id)).toBe(24)

    const removal = await owner.api.catalog.products({ id: water.id }).patch({ packs: [] })
    expect(removal.status).toBe(409)
    expect(removal.error?.value).toMatchObject({ code: 'PACK_IN_USE' })
    const after = ok(await owner.api.catalog.products({ id: water.id }).get())
    expect(after.packs).toEqual([expect.objectContaining({ id: packId, barcode: 'BOX6', size: 6 })])
  })
})

describe('rejecting a sale', () => {
  // Every rejection must leave stock and the receipt sequence untouched.
  const expectNothingRecorded = async (productId: number, stock: number) => {
    expect(await stockOf(productId)).toBe(stock)
    expect(await allSales()).toHaveLength(0)
  }

  test('insufficient stock', async () => {
    const tea = await seedProduct(owner, { stock: 2 })

    const result = await cashier.api.sales.post({ items: [{ productId: tea.id, quantity: 3 }], payments: cash(3000) })

    expect(result.status).toBe(409)
    expect(result.error?.value).toMatchObject({ code: 'INSUFFICIENT_STOCK' })
    await expectNothingRecorded(tea.id, 2)
  })

  test('a failing line rolls back the other lines of the same sale', async () => {
    const tea = await seedProduct(owner, { stock: 10 })
    const cake = await seedProduct(owner, { stock: 1 })

    const result = await cashier.api.sales.post({
      items: [
        { productId: tea.id, quantity: 5 },
        { productId: cake.id, quantity: 2 },
      ],
      payments: cash(100000),
    })

    expect(result.status).toBe(409)
    await expectNothingRecorded(tea.id, 10)
  })

  test('inactive product', async () => {
    const tea = await seedProduct(owner, { stock: 5 })
    ok(await owner.api.catalog.products({ id: tea.id }).patch({ isActive: false }))

    const result = await cashier.api.sales.post({ items: [{ productId: tea.id, quantity: 1 }], payments: cash(1000) })

    expect(result.status).toBe(409)
    expect(result.error?.value).toMatchObject({ code: 'PRODUCT_INACTIVE' })
    await expectNothingRecorded(tea.id, 5)
  })

  test('unknown product', async () => {
    const result = await cashier.api.sales.post({ items: [{ productId: 9999, quantity: 1 }], payments: cash(1000) })

    expect(result.status).toBe(400)
    expect(result.error?.value).toMatchObject({ code: 'PRODUCT_NOT_FOUND' })
    expect(await allSales()).toHaveLength(0)
  })

  test('underpayment', async () => {
    const tea = await seedProduct(owner, { priceSatang: 1000, stock: 5 })

    const result = await cashier.api.sales.post({ items: [{ productId: tea.id, quantity: 1 }], payments: cash(999) })

    expect(result.status).toBe(400)
    expect(result.error?.value).toMatchObject({ code: 'UNDERPAID' })
    await expectNothingRecorded(tea.id, 5)
  })

  test('overpayment by a non-cash method', async () => {
    const tea = await seedProduct(owner, { priceSatang: 1000, stock: 5 })

    const result = await cashier.api.sales.post({
      items: [{ productId: tea.id, quantity: 1 }],
      payments: [{ method: 'card', amountSatang: 1500 }],
    })

    expect(result.status).toBe(400)
    expect(result.error?.value).toMatchObject({ code: 'OVERPAID' })
    await expectNothingRecorded(tea.id, 5)
  })

  test('discount larger than the subtotal', async () => {
    const tea = await seedProduct(owner, { priceSatang: 1000, stock: 5 })

    const result = await cashier.api.sales.post({
      items: [{ productId: tea.id, quantity: 1 }],
      discountSatang: 1001,
      payments: cash(1000),
    })

    expect(result.status).toBe(400)
    expect(result.error?.value).toMatchObject({ code: 'DISCOUNT_TOO_LARGE' })
    await expectNothingRecorded(tea.id, 5)
  })

  test.each([0, -1, 1.5])('quantity %p is a validation error', async (quantity) => {
    const tea = await seedProduct(owner, { stock: 5 })

    const result = await cashier.api.sales.post({ items: [{ productId: tea.id, quantity }], payments: cash(1000) })

    expect(result.status).toBe(422)
    await expectNothingRecorded(tea.id, 5)
  })

  test('an empty cart or no payment is a validation error', async () => {
    const tea = await seedProduct(owner, { stock: 5 })

    const noItems = await cashier.api.sales.post({ items: [], payments: cash(1000) })
    const noPayment = await cashier.api.sales.post({ items: [{ productId: tea.id, quantity: 1 }], payments: [] })

    expect(noItems.status).toBe(422)
    expect(noPayment.status).toBe(422)
  })

  test('a line total beyond the integer range is a client error, not a crash', async () => {
    const jet = await seedProduct(owner, { priceSatang: 2_000_000_000, trackStock: false })

    const result = await cashier.api.sales.post({
      items: [{ productId: jet.id, quantity: 2 }],
      payments: cash(4_000_000_000),
    })

    expect(result.status).toBeGreaterThanOrEqual(400)
    expect(result.status).toBeLessThan(500)
    expect(result.error?.value).toMatchObject({ code: 'AMOUNT_TOO_LARGE', detail: 'ยอดเงินเกินกว่าที่ระบบรองรับ' })
    expect(await allSales()).toHaveLength(0)
  })
})

describe('concurrent sales', () => {
  test('never oversell and never reuse a receipt number', async () => {
    const tea = await seedProduct(owner, { priceSatang: 1000, stock: 48 })

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        cashier.api.sales.post({ items: [{ productId: tea.id, quantity: 5 }], payments: cash(5000) }),
      ),
    )

    const succeeded = results.filter((result) => result.status === 200)
    const refused = results.filter((result) => result.status === 409)
    // Which requests win is timing-dependent; these totals are not.
    expect(succeeded).toHaveLength(9)
    expect(refused).toHaveLength(11)
    expect(await stockOf(tea.id)).toBe(3)

    const receiptNumbers = succeeded.map((result) => result.data!.receiptNo)
    expect(new Set(receiptNumbers).size).toBe(9)
  })
})
