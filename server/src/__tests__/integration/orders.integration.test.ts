import { beforeEach, describe, expect, test } from 'bun:test'
import {
  baseUrl,
  ok,
  resetDatabase,
  seedProduct,
  signIn,
  type Session,
} from '../../../test/harness'

let owner: Session
let cashier: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
  cashier = await signIn('cashier')
})

const cash = (amountSatang: number) => [{ method: 'cash' as const, amountSatang }]
const stockOf = async (id: number) => ok(await owner.api.catalog.products({ id }).get()).stockQty

describe('building an order', () => {
  test('opens empty, then takes products, quantities and removals', async () => {
    const tea = await seedProduct(owner, { name: 'Tea', priceSatang: 2500, stock: 10 })
    const cake = await seedProduct(owner, { name: 'Cake', priceSatang: 5700, stock: 10 })

    const opened = ok(await cashier.api.orders.post({ label: 'โต๊ะ 4' }))
    expect(opened).toMatchObject({
      status: 'open',
      label: 'โต๊ะ 4',
      items: [],
      itemCount: 0,
      subtotalSatang: 0,
      saleId: null,
      openedById: cashier.user.id,
    })

    const id = opened.id
    ok(await cashier.api.orders({ id }).items.post({ productId: tea.id, quantity: 2 }))
    ok(await cashier.api.orders({ id }).items.post({ productId: cake.id, quantity: 1 }))
    const merged = ok(await cashier.api.orders({ id }).items.post({ productId: tea.id, quantity: 1 }))
    expect(merged.items.map((item) => [item.productName, item.quantity, item.lineTotalSatang])).toEqual([
      ['Tea', 3, 7500],
      ['Cake', 1, 5700],
    ])
    expect(merged).toMatchObject({ itemCount: 4, subtotalSatang: 13_200 })

    ok(await cashier.api.orders({ id }).items({ productId: tea.id }).patch({ quantity: 1 }))
    const afterRemoval = ok(await cashier.api.orders({ id }).items({ productId: cake.id }).delete())
    expect(afterRemoval.items.map((item) => [item.productName, item.quantity])).toEqual([['Tea', 1]])

    expect(ok(await cashier.api.orders({ id }).patch({ label: null })).label).toBeNull()
  })

  test('can start with its first lines, and adding stock-less products is allowed', async () => {
    const tea = await seedProduct(owner, { priceSatang: 2500, stock: 0 })

    const opened = ok(await cashier.api.orders.post({ items: [{ productId: tea.id, quantity: 3 }] }))

    expect(opened).toMatchObject({ itemCount: 3, subtotalSatang: 7500 })
    expect(await stockOf(tea.id)).toBe(0)
  })

  test('taking an order changes no stock until it is paid', async () => {
    const tea = await seedProduct(owner, { stock: 5 })
    ok(await cashier.api.orders.post({ items: [{ productId: tea.id, quantity: 4 }] }))

    expect(await stockOf(tea.id)).toBe(5)
  })

  test('an unknown or inactive product is refused', async () => {
    const tea = await seedProduct(owner, { stock: 5 })
    const order = ok(await cashier.api.orders.post({}))

    const unknown = await cashier.api.orders({ id: order.id }).items.post({ productId: 9999, quantity: 1 })
    expect(unknown.status).toBe(404)
    expect(unknown.error?.value).toMatchObject({ code: 'PRODUCT_NOT_FOUND' })

    ok(await owner.api.catalog.products({ id: tea.id }).patch({ isActive: false }))
    const inactive = await cashier.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 1 })
    expect(inactive.status).toBe(409)
    expect(inactive.error?.value).toMatchObject({ code: 'PRODUCT_INACTIVE' })
  })

  test('a product that is not on the order cannot have its quantity set or be removed', async () => {
    const order = ok(await cashier.api.orders.post({}))

    const set = await cashier.api.orders({ id: order.id }).items({ productId: 123 }).patch({ quantity: 2 })
    const removed = await cashier.api.orders({ id: order.id }).items({ productId: 123 }).delete()

    expect([set.status, removed.status]).toEqual([404, 404])
    expect(set.error?.value).toMatchObject({ code: 'ORDER_ITEM_NOT_FOUND' })
  })

  test('lists the open orders of the branch, oldest first, and filters by status', async () => {
    const first = ok(await cashier.api.orders.post({ label: 'A' }))
    const second = ok(await cashier.api.orders.post({ label: 'B' }))
    ok(await cashier.api.orders({ id: first.id }).cancel.post({ reason: 'ลูกค้าไม่รอ' }))

    const open = ok(await cashier.api.orders.get({ query: {} }))
    const cancelled = ok(await cashier.api.orders.get({ query: { status: 'cancelled' } }))

    expect(open.items.map((order) => order.id)).toEqual([second.id])
    expect(cancelled.items.map((order) => order.id)).toEqual([first.id])
    expect(cancelled.items[0]).toMatchObject({ status: 'cancelled', cancelReason: 'ลูกค้าไม่รอ' })
  })

  test('needs a session', async () => {
    const response = await fetch(`${baseUrl}/orders`)

    expect(response.status).toBe(401)
  })
})

describe('paying an order', () => {
  test('makes a sale at the quoted prices, takes the stock, and closes the order with the sale', async () => {
    const tea = await seedProduct(owner, { name: 'Tea', priceSatang: 2500, stock: 10 })
    const cake = await seedProduct(owner, { name: 'Cake', priceSatang: 5700, stock: 5 })
    const order = ok(
      await cashier.api.orders.post({
        items: [
          { productId: tea.id, quantity: 2 },
          { productId: cake.id, quantity: 1 },
        ],
      }),
    )

    const sale = ok(await cashier.api.orders({ id: order.id }).pay.post({ discountSatang: 700, payments: cash(20_000) }))

    // The same numbers a one-step sale of these lines gives (see sales.integration.test.ts).
    expect(sale).toMatchObject({
      status: 'completed',
      subtotalSatang: 10_700,
      discountSatang: 700,
      totalSatang: 10_000,
      vatSatang: 654,
      paidSatang: 20_000,
      changeSatang: 10_000,
      cashierId: cashier.user.id,
    })
    expect(sale.receiptNo).toMatch(/^MAIN-\d{8}-00001$/)
    expect(await stockOf(tea.id)).toBe(8)
    expect(await stockOf(cake.id)).toBe(4)

    const closed = ok(await cashier.api.orders({ id: order.id }).get())
    expect(closed).toMatchObject({ status: 'paid', saleId: sale.id })
    expect(ok(await cashier.api.orders.get({ query: {} })).items).toEqual([])
    expect(ok(await owner.api.sales({ id: sale.id }).get()).receiptNo).toBe(sale.receiptNo)
  })

  test('charges the price quoted when the item was added, not the price at payment', async () => {
    const tea = await seedProduct(owner, { priceSatang: 2500, stock: 10 })
    const order = ok(await cashier.api.orders.post({ items: [{ productId: tea.id, quantity: 2 }] }))

    ok(await owner.api.catalog.products({ id: tea.id }).patch({ priceSatang: 4000 }))
    // Adding more of the same product keeps the first quote too.
    ok(await cashier.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 1 }))

    const sale = ok(await cashier.api.orders({ id: order.id }).pay.post({ payments: cash(10_000) }))

    expect(sale.items[0]).toMatchObject({ unitPriceSatang: 2500, quantity: 3, lineTotalSatang: 7500 })
    expect(sale.totalSatang).toBe(7500)
  })

  test('applies the VAT rules in force when it is paid', async () => {
    const tea = await seedProduct(owner, { priceSatang: 10_000, stock: 5 })
    const order = ok(await cashier.api.orders.post({ items: [{ productId: tea.id, quantity: 1 }] }))
    ok(await owner.api.settings.patch({ vatMode: 'exclusive', vatRateBp: 700 }))

    const sale = ok(await cashier.api.orders({ id: order.id }).pay.post({ payments: cash(20_000) }))

    expect(sale).toMatchObject({ vatMode: 'exclusive', vatRateBp: 700, vatSatang: 700, totalSatang: 10_700 })
  })

  test('the sale is an ordinary sale: it shows in the summary and a void returns its stock', async () => {
    const tea = await seedProduct(owner, { priceSatang: 1000, stock: 5 })
    const order = ok(await cashier.api.orders.post({ items: [{ productId: tea.id, quantity: 2 }] }))
    const sale = ok(await cashier.api.orders({ id: order.id }).pay.post({ payments: cash(2000) }))

    const period = { from: new Date(Date.now() - 3_600_000), to: new Date(Date.now() + 3_600_000) }
    expect(ok(await owner.api.sales.summary.get({ query: period })).totalSatang).toBe(2000)

    ok(await owner.api.sales({ id: sale.id }).void.post({ reason: 'คิดเงินผิด' }))
    expect(await stockOf(tea.id)).toBe(5)
  })

  test('not enough stock at payment refuses the sale and leaves the order open for another try', async () => {
    const tea = await seedProduct(owner, { stock: 1 })
    const order = ok(await cashier.api.orders.post({ items: [{ productId: tea.id, quantity: 3 }] }))

    const refused = await cashier.api.orders({ id: order.id }).pay.post({ payments: cash(100_000) })

    expect(refused.status).toBe(409)
    expect(refused.error?.value).toMatchObject({ code: 'INSUFFICIENT_STOCK' })
    expect(ok(await cashier.api.orders({ id: order.id }).get())).toMatchObject({ status: 'open', saleId: null })
    expect(await stockOf(tea.id)).toBe(1)

    ok(await cashier.api.orders({ id: order.id }).items({ productId: tea.id }).patch({ quantity: 1 }))
    ok(await cashier.api.orders({ id: order.id }).pay.post({ payments: cash(100_000) }))
  })

  test('an underpaid order is refused and nothing changes', async () => {
    const tea = await seedProduct(owner, { priceSatang: 2500, stock: 5 })
    const order = ok(await cashier.api.orders.post({ items: [{ productId: tea.id, quantity: 1 }] }))

    const refused = await cashier.api.orders({ id: order.id }).pay.post({ payments: cash(1000) })

    expect(refused.status).toBe(400)
    expect(refused.error?.value).toMatchObject({ code: 'UNDERPAID' })
    expect(ok(await cashier.api.orders({ id: order.id }).get()).status).toBe('open')
    expect(await stockOf(tea.id)).toBe(5)
  })

  test('an empty order cannot be paid', async () => {
    const order = ok(await cashier.api.orders.post({}))

    const refused = await cashier.api.orders({ id: order.id }).pay.post({ payments: cash(1000) })

    expect(refused.status).toBe(400)
    expect(refused.error?.value).toMatchObject({ code: 'ORDER_EMPTY' })
  })

  test('an order can be paid only once, and a paid or cancelled order cannot be edited', async () => {
    const tea = await seedProduct(owner, { priceSatang: 1000, stock: 10 })
    const paid = ok(await cashier.api.orders.post({ items: [{ productId: tea.id, quantity: 1 }] }))
    ok(await cashier.api.orders({ id: paid.id }).pay.post({ payments: cash(1000) }))
    const cancelled = ok(await cashier.api.orders.post({ items: [{ productId: tea.id, quantity: 1 }] }))
    ok(await cashier.api.orders({ id: cancelled.id }).cancel.post({ reason: 'เปลี่ยนใจ' }))

    for (const { id } of [paid, cancelled]) {
      const again = await cashier.api.orders({ id }).pay.post({ payments: cash(1000) })
      const add = await cashier.api.orders({ id }).items.post({ productId: tea.id, quantity: 1 })
      const cancel = await cashier.api.orders({ id }).cancel.post({ reason: 'อีกครั้ง' })

      expect([again.status, add.status, cancel.status]).toEqual([409, 409, 409])
      expect(again.error?.value).toMatchObject({ code: 'ORDER_NOT_OPEN' })
    }
    expect(await stockOf(tea.id)).toBe(9)
  })

  test('two tills paying the same order make exactly one sale', async () => {
    const tea = await seedProduct(owner, { priceSatang: 1000, stock: 10 })
    const order = ok(await cashier.api.orders.post({ items: [{ productId: tea.id, quantity: 2 }] }))
    const second = await signIn('cashier', 'cashier-2')

    const results = await Promise.all([
      cashier.api.orders({ id: order.id }).pay.post({ payments: cash(2000) }),
      second.api.orders({ id: order.id }).pay.post({ payments: cash(2000) }),
    ])

    expect(results.filter((result) => !result.error)).toHaveLength(1)
    expect(results.find((result) => result.error)?.status).toBe(409)
    expect(await stockOf(tea.id)).toBe(8)
    expect(ok(await owner.api.sales.get({ query: {} })).total).toBe(1)
  })
})
