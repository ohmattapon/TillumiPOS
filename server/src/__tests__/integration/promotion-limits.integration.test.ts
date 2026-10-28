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
const lines = (productId: number, quantity = 2) => [{ productId, quantity }]

/** A product of 25.00 with 10 in stock and a 10% promotion: 2 of them are 50.00 less 5.00 = 45.00. */
async function shop(limits: { maxUses?: number; maxUsesPerMember?: number } = {}) {
  const tea = await seedProduct(owner, { priceSatang: 2500, stock: 10 })
  const promotion = ok(await owner.api.promotions.post({ name: 'ลด 10%', kind: 'percent', value: 1000, ...limits }))
  return { tea, promotion }
}
const quoteFor = async (productId: number, quantity = 2) =>
  ok(await cashier.api.quotes.post({ lines: lines(productId, quantity) }))
const sell = (productId: number, quoteId: number, payments = cash(4500)) =>
  cashier.api.sales.post({ items: lines(productId), payments, quoteId })

describe('promotion usage limits over HTTP', () => {
  test('a promotion answers how many times it was used and whether it is exhausted', async () => {
    const { tea, promotion } = await shop({ maxUses: 1 })
    expect(ok(await owner.api.promotions({ id: promotion.id }).get())).toMatchObject({
      usedCount: 0, isExhausted: false, maxUses: 1,
    })
    ok(await sell(tea.id, (await quoteFor(tea.id)).id))
    expect(ok(await owner.api.promotions({ id: promotion.id }).get())).toMatchObject({
      usedCount: 1, isExhausted: true,
    })
  })

  test('a voided sale gives its use back', async () => {
    const { tea, promotion } = await shop({ maxUses: 1 })
    const sale = ok(await sell(tea.id, (await quoteFor(tea.id)).id))
    // The slot is gone: a new cart is priced without the promotion.
    expect((await quoteFor(tea.id)).promotion).toBeNull()

    ok(await owner.api.sales({ id: sale.id }).void.post({ reason: 'ผิดรายการ' }))
    expect(ok(await owner.api.promotions({ id: promotion.id }).get())).toMatchObject({
      usedCount: 0, isExhausted: false,
    })

    // There is a slot free again: the cart is priced with the promotion one more time.
    const reopened = await quoteFor(tea.id)
    expect(reopened.promotion).toMatchObject({ id: promotion.id, discountSatang: 500 })
    ok(await sell(tea.id, reopened.id))
    // Sold again: the slot is spent once more.
    expect((await quoteFor(tea.id)).promotion).toBeNull()
  })

  test('two cash sales on the last use at once: one bill, one PROMOTION_LIMIT_REACHED', async () => {
    const { tea } = await shop({ maxUses: 1 })
    // Two quotes are made before either sale, so each till decided with a shared slot still free.
    const first = await quoteFor(tea.id)
    const second = await quoteFor(tea.id)

    const results = await Promise.all([sell(tea.id, first.id), sell(tea.id, second.id)])

    expect(results.map((result) => result.status).sort()).toEqual([200, 409])
    const refused = results.find((result) => result.error)
    expect(refused?.error?.value).toMatchObject({ code: 'PROMOTION_LIMIT_REACHED' })
    expect(ok(await owner.api.sales.get({ query: {} })).total).toBe(1)
    expect(ok(await owner.api.catalog.products({ id: tea.id }).get()).stockQty).toBe(8)
  })
})
