import { beforeEach, describe, expect, test } from 'bun:test'
import { baseUrl, ok, resetDatabase, seedBranch, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session
let cashier: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
  cashier = await signIn('cashier')
})

const tenPercent = { name: 'ลด 10%', kind: 'percent' as const, value: 1000 }

describe('creating a quote', () => {
  test('prices the cart, picks the best promotion and pins the VAT rules', async () => {
    const tea = await seedProduct(owner, { priceSatang: 2500, stock: 10 })
    ok(await owner.api.promotions.post(tenPercent))
    ok(await owner.api.promotions.post({ name: 'ลด 3 บาท', kind: 'fixed', value: 300 }))

    const quote = ok(await cashier.api.quotes.post({ lines: [{ productId: tea.id, quantity: 2 }] }))

    expect(quote).toMatchObject({
      status: 'open', branchId: 1, memberId: null, orderId: null, subtotalSatang: 5000, discountSatang: 500,
      totalSatang: 4500, vatMode: 'inclusive', vatRateBp: 700, vatSatang: 294,
      promotion: { name: 'ลด 10%', kind: 'percent', value: 1000, discountSatang: 500 },
    })
    expect(quote.lines).toEqual([
      { productId: tea.id, productName: tea.name, sku: tea.sku, unitPriceSatang: 2500, quantity: 2, options: [] },
    ])
    expect(new Date(quote.expiresAt).getTime()).toBeGreaterThan(Date.now() + 14 * 60_000)
  })

  test('a cart with no promotion that applies is still priced and pinned', async () => {
    const tea = await seedProduct(owner, { priceSatang: 2500, stock: 10 })
    ok(await owner.api.promotions.post({ ...tenPercent, audience: 'members' }))
    const quote = ok(await cashier.api.quotes.post({ lines: [{ productId: tea.id, quantity: 1 }] }))
    expect(quote).toMatchObject({ promotion: null, discountSatang: 0, totalSatang: 2500 })
  })

  test('a members-only promotion applies once a member is on the quote', async () => {
    const tea = await seedProduct(owner, { priceSatang: 2500, stock: 10 })
    ok(await owner.api.promotions.post({ ...tenPercent, audience: 'members' }))
    const member = ok(await cashier.api.members.post({ name: 'ลูกค้าประจำ', phone: '0812345678' }))
    const quote = ok(await cashier.api.quotes.post({ lines: [{ productId: tea.id, quantity: 2 }], memberId: member.id }))
    expect(quote).toMatchObject({ memberId: member.id, member: { id: member.id, name: 'ลูกค้าประจำ' }, discountSatang: 500 })
  })

  test('a switched-off promotion is left out', async () => {
    const tea = await seedProduct(owner, { priceSatang: 2500, stock: 10 })
    const promotion = ok(await owner.api.promotions.post(tenPercent))
    ok(await owner.api.promotions({ id: promotion.id }).patch({ isActive: false }))
    expect(ok(await cashier.api.quotes.post({ lines: [{ productId: tea.id, quantity: 2 }] })).promotion).toBeNull()
  })

  test("prices an open order at the prices it quoted, whatever the menu says now", async () => {
    const tea = await seedProduct(owner, { priceSatang: 2500, stock: 10 })
    const order = ok(await cashier.api.orders.post({ items: [{ productId: tea.id, quantity: 2 }] }))
    ok(await owner.api.catalog.products({ id: tea.id }).patch({ priceSatang: 9000 }))
    const quote = ok(await cashier.api.quotes.post({ orderId: order.id }))
    expect(quote).toMatchObject({ orderId: order.id, subtotalSatang: 5000, totalSatang: 5000 })
  })

  test('refuses an empty request, both lines and an order, a short stock and an unknown order', async () => {
    const tea = await seedProduct(owner, { priceSatang: 2500, stock: 1 })
    expect((await cashier.api.quotes.post({})).status).toBe(422)
    expect((await cashier.api.quotes.post({ orderId: 1, lines: [{ productId: tea.id, quantity: 1 }] })).status).toBe(422)
    const short = await cashier.api.quotes.post({ lines: [{ productId: tea.id, quantity: 2 }] })
    expect(short.status).toBe(409)
    expect(short.error?.value).toMatchObject({ code: 'INSUFFICIENT_STOCK' })
    expect((await cashier.api.quotes.post({ orderId: 99999 })).status).toBe(404)
    expect((await fetch(`${baseUrl}/quotes/1`)).status).toBe(401)
  })
})

describe('reading and cancelling', () => {
  test('a quote is read as it was made, and a read changes nothing', async () => {
    const tea = await seedProduct(owner, { priceSatang: 2500, stock: 10 })
    const made = ok(await cashier.api.quotes.post({ lines: [{ productId: tea.id, quantity: 2 }] }))
    ok(await owner.api.catalog.products({ id: tea.id }).patch({ priceSatang: 9000 }))
    expect(ok(await cashier.api.quotes({ id: made.id }).get())).toEqual(made)
  })

  test('an open quote can be cancelled, once, and then it is cancelled for good', async () => {
    const tea = await seedProduct(owner, { priceSatang: 2500, stock: 10 })
    const made = ok(await cashier.api.quotes.post({ lines: [{ productId: tea.id, quantity: 1 }] }))
    expect(ok(await cashier.api.quotes({ id: made.id }).cancel.post()).status).toBe('cancelled')
    expect(ok(await cashier.api.quotes({ id: made.id }).cancel.post()).status).toBe('cancelled')
    expect(ok(await cashier.api.quotes({ id: made.id }).get()).status).toBe('cancelled')
  })

  test("another branch's quote is not found", async () => {
    const tea = await seedProduct(owner, { priceSatang: 2500, stock: 10 })
    const made = ok(await cashier.api.quotes.post({ lines: [{ productId: tea.id, quantity: 1 }] }))
    const other = await seedBranch('BKK', 'สาขากรุงเทพ')
    const away = await signIn('cashier', 'bkk-cashier', { branchId: other.id })
    expect((await away.api.quotes({ id: made.id }).get()).status).toBe(404)
    expect((await away.api.quotes({ id: made.id }).cancel.post()).status).toBe(404)
  })
})
