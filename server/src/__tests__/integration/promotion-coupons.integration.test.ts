import { beforeEach, describe, expect, test } from 'bun:test'
import { ok, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session
let cashier: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
  cashier = await signIn('cashier')
})

describe('coupons and bundles over HTTP', () => {
  test('a coupon promotion round-trips over HTTP', async () => {
    const created = ok(await owner.api.promotions.post({
      name: 'คูปองลด 10%', kind: 'percent', value: 1000, couponCode: '  summer10  ',
    }))
    // The code is stored upper-case and every field the coupon does not use answers null.
    expect(created).toMatchObject({
      kind: 'percent', value: 1000, couponCode: 'SUMMER10',
      buyQuantity: null, freeQuantity: null, maxUses: null, maxUsesPerMember: null,
    })
    expect(ok(await owner.api.promotions({ id: created.id }).get())).toMatchObject({ couponCode: 'SUMMER10' })

    // The code can also be cleared by an edit, and limits can be kept when they are not sent.
    const limited = ok(await owner.api.promotions({ id: created.id }).patch({ maxUses: 50, maxUsesPerMember: 2 }))
    expect(limited).toMatchObject({ maxUses: 50, maxUsesPerMember: 2 })
    const cleared = ok(await owner.api.promotions({ id: created.id }).patch({ couponCode: null }))
    expect(cleared).toMatchObject({ couponCode: null, maxUses: 50, maxUsesPerMember: 2 })
  })

  test('a bundle promotion round-trips over HTTP', async () => {
    const created = ok(await owner.api.promotions.post({
      name: 'ซื้อ 2 แถม 1', kind: 'bundle', value: 0, buyQuantity: 2, freeQuantity: 1, maxUses: 100,
      scope: { productIds: [7], categoryIds: [] },
    }))
    expect(created).toMatchObject({
      kind: 'bundle', value: 0, buyQuantity: 2, freeQuantity: 1, maxUses: 100, couponCode: null,
    })
  })

  test('two promotions cannot share a coupon code in any case', async () => {
    ok(await owner.api.promotions.post({ name: 'คูปองเช้า', kind: 'percent', value: 1000, couponCode: 'SUMMER10' }))
    const sameCase = await owner.api.promotions.post({ name: 'คูปองเย็น', kind: 'fixed', value: 1000, couponCode: 'SUMMER10' })
    expect(sameCase.status).toBe(409)
    expect(sameCase.error?.value).toMatchObject({ code: 'COUPON_CODE_TAKEN' })
    const otherCase = await owner.api.promotions.post({ name: 'คูปองเย็น', kind: 'fixed', value: 1000, couponCode: 'summer10' })
    expect(otherCase.status).toBe(409)
    expect(otherCase.error?.value).toMatchObject({ code: 'COUPON_CODE_TAKEN' })
  })
})

describe('a sale from a coupon quote over HTTP', () => {
  test('a sale made from a coupon quote stores the coupon code in its promotion snapshot', async () => {
    const tea = await seedProduct(owner, { priceSatang: 2500, stock: 10 })
    ok(await owner.api.promotions.post({ name: 'คูปองลด 10%', kind: 'percent', value: 1000, couponCode: 'SUMMER10' }))
    const quote = ok(await cashier.api.quotes.post({ lines: [{ productId: tea.id, quantity: 2 }], couponCode: ' summer10 ' }))
    expect(quote).toMatchObject({ couponCode: 'SUMMER10', promotion: { name: 'คูปองลด 10%', discountSatang: 500, couponCode: 'SUMMER10' } })

    const sale = ok(await cashier.api.sales.post({
      items: [{ productId: tea.id, quantity: 2 }],
      payments: [{ method: 'cash' as const, amountSatang: 4500 }],
      quoteId: quote.id,
    }))
    expect(sale.promotion).toMatchObject({ name: 'คูปองลด 10%', discountSatang: 500, couponCode: 'SUMMER10' })
    expect(ok(await cashier.api.sales({ id: sale.id }).get()).promotion).toMatchObject({ couponCode: 'SUMMER10' })
  })
})
