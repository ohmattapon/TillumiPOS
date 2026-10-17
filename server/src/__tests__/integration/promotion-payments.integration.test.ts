import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { priceQuotes } from '../../infrastructure/database/schema/price-quotes'
import { qrPayments } from '../../infrastructure/database/schema/qr-payments'
import { db } from '../../libs/db'
import { fakeScb, SCB_ENV_KEYS } from '../../../test/scb-server'
import { ok, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session
let cashier: Session

beforeEach(async () => {
  await resetDatabase()
  fakeScb.reset()
  fakeScb.enableIn(Bun.env)
  owner = await signIn('owner')
  cashier = await signIn('cashier')
})

afterEach(() => {
  for (const key of SCB_ENV_KEYS) delete Bun.env[key]
})

const cash = (amountSatang: number) => [{ method: 'cash' as const, amountSatang }]
const promptpay = (amountSatang: number, qrPaymentId: number) => [{ method: 'promptpay' as const, amountSatang, qrPaymentId }]
const lines = (productId: number, quantity = 2) => [{ productId, quantity }]

/** A product of 25.00 with 10 in stock, and a 10% promotion: 2 of them are 50.00 less 5.00 = 45.00. */
async function shop() {
  const tea = await seedProduct(owner, { priceSatang: 2500, stock: 10 })
  const promotion = ok(await owner.api.promotions.post({ name: 'ลด 10%', kind: 'percent', value: 1000 }))
  return { tea, promotion }
}
const quoteFor = async (productId: number, quantity = 2, extra: { memberId?: number } = {}) =>
  ok(await cashier.api.quotes.post({ lines: lines(productId, quantity), ...extra }))
const statusOf = async (quoteId: number) => ok(await cashier.api.quotes({ id: quoteId }).get()).status
const stockOf = async (productId: number) => ok(await owner.api.catalog.products({ id: productId }).get()).stockQty
const createQr = async (amountSatang: number, quoteId?: number) =>
  ok(await cashier.api.payments.qr.post({ amountSatang, ...(quoteId !== undefined && { quoteId }) }))

/** The customer pays at the bank and the till's next poll sees it. */
async function customerPays(payment: { id: number; reference: string }) {
  fakeScb.pay(payment.reference)
  await db.update(qrPayments).set({ lastCheckedAt: null }).where(eq(qrPayments.id, payment.id))
  return ok(await cashier.api.payments.qr({ id: payment.id }).get())
}

/** What the shop might change after a price was pinned: the promotion, the menu and the VAT. */
async function shopMovesOn(tea: { id: number }, promotion: { id: number }) {
  ok(await owner.api.promotions({ id: promotion.id }).patch({ isActive: false }))
  ok(await owner.api.catalog.products({ id: tea.id }).patch({ priceSatang: 9000 }))
  ok(await owner.api.settings.patch({ vatMode: 'exclusive' }))
}

describe('a sale at a pinned price', () => {
  test('charges the quote, records the promotion, uses the quote up, and cannot be repeated', async () => {
    const { tea } = await shop()
    const quote = await quoteFor(tea.id)

    const sale = ok(await cashier.api.sales.post({ items: lines(tea.id), payments: cash(5000), quoteId: quote.id }))

    expect(sale).toMatchObject({
      subtotalSatang: 5000, discountSatang: 500, totalSatang: 4500, vatSatang: 294, paidSatang: 5000, changeSatang: 500,
      promotion: { name: 'ลด 10%', kind: 'percent', value: 1000, discountSatang: 500 },
    })
    expect(ok(await cashier.api.sales({ id: sale.id }).get()).promotion).toMatchObject({ name: 'ลด 10%' })
    expect(await statusOf(quote.id)).toBe('consumed')
    expect(await stockOf(tea.id)).toBe(8)

    const again = await cashier.api.sales.post({ items: lines(tea.id), payments: cash(5000), quoteId: quote.id })
    expect(again.status).toBe(409)
    expect(again.error?.value).toMatchObject({ code: 'QUOTE_NOT_OPEN' })
    expect(await stockOf(tea.id)).toBe(8)
  })

  test('two tills selling the same quote at once make one sale', async () => {
    const { tea } = await shop()
    const quote = await quoteFor(tea.id)

    const results = await Promise.all([
      cashier.api.sales.post({ items: lines(tea.id), payments: cash(5000), quoteId: quote.id }),
      owner.api.sales.post({ items: lines(tea.id), payments: cash(5000), quoteId: quote.id }),
    ])

    expect(results.map((result) => result.status).sort()).toEqual([200, 409])
    expect(await stockOf(tea.id)).toBe(8)
    expect(ok(await owner.api.sales.get({ query: {} })).total).toBe(1)
  })

  test('a promotion switched off, a new price and new VAT rules change nothing for a quote already made', async () => {
    const { tea, promotion } = await shop()
    const quote = await quoteFor(tea.id)
    await shopMovesOn(tea, promotion)

    const sale = ok(await cashier.api.sales.post({ items: lines(tea.id), payments: cash(5000), quoteId: quote.id }))

    expect(sale).toMatchObject({ subtotalSatang: 5000, discountSatang: 500, totalSatang: 4500, vatMode: 'inclusive', vatSatang: 294 })
    // A sale without a quote now meets the new rules: no promotion, 90.00 a unit, VAT on top.
    const fresh = ok(await cashier.api.sales.post({ items: lines(tea.id, 1), payments: cash(10000) }))
    expect(fresh).toMatchObject({ discountSatang: 0, subtotalSatang: 9000, vatMode: 'exclusive', promotion: null })
  })

  test('an expired quote is refused and nothing is sold', async () => {
    const { tea } = await shop()
    const quote = await quoteFor(tea.id)
    await db.update(priceQuotes).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(priceQuotes.id, quote.id))

    const refused = await cashier.api.sales.post({ items: lines(tea.id), payments: cash(5000), quoteId: quote.id })

    expect(refused.status).toBe(409)
    expect(refused.error?.value).toMatchObject({ code: 'QUOTE_EXPIRED' })
    expect(await stockOf(tea.id)).toBe(10)
  })

  test('a typed discount cannot be added to a quote, and another cart does not match it', async () => {
    const { tea } = await shop()
    const quote = await quoteFor(tea.id)

    const both = await cashier.api.sales.post({ items: lines(tea.id), discountSatang: 100, payments: cash(5000), quoteId: quote.id })
    expect(both.error?.value).toMatchObject({ code: 'PROMOTION_AND_DISCOUNT_CONFLICT' })

    const other = await cashier.api.sales.post({ items: lines(tea.id, 3), payments: cash(9000), quoteId: quote.id })
    expect(other.status).toBe(409)
    expect(other.error?.value).toMatchObject({ code: 'QUOTE_MISMATCH' })
    // The quote was not lost: the right cart still sells.
    expect(await statusOf(quote.id)).toBe('open')
    ok(await cashier.api.sales.post({ items: lines(tea.id), payments: cash(5000), quoteId: quote.id }))
  })

  test('a sale without a quote is the sale it always was', async () => {
    const { tea } = await shop()
    const sale = ok(await cashier.api.sales.post({ items: lines(tea.id), discountSatang: 300, payments: cash(5000) }))
    expect(sale).toMatchObject({ discountSatang: 300, totalSatang: 4700, promotion: null })
  })
})

describe('a QR made from a quote', () => {
  test('is billed at the quoted price however long the customer takes and whatever the shop changed', async () => {
    const { tea, promotion } = await shop()
    const quote = await quoteFor(tea.id)
    const qr = await createQr(4500, quote.id)
    expect(await statusOf(quote.id)).toBe('reserved')

    await shopMovesOn(tea, promotion)
    await customerPays(qr)
    // The quote does not expire by time while its QR is waiting.
    await db.update(priceQuotes).set({ expiresAt: new Date(Date.now() - 60 * 60_000) }).where(eq(priceQuotes.id, quote.id))

    const sale = ok(await cashier.api.sales.post({ items: lines(tea.id), payments: promptpay(4500, qr.id), quoteId: quote.id }))

    expect(sale).toMatchObject({ totalSatang: 4500, discountSatang: 500, vatMode: 'inclusive', promotion: { name: 'ลด 10%' } })
    expect(await statusOf(quote.id)).toBe('consumed')
    expect(ok(await cashier.api.payments.qr({ id: qr.id }).get()).saleId).toBe(sale.id)
  })

  test('may be for part of the total, with the rest paid another way, but not for more', async () => {
    const { tea } = await shop()
    const quote = await quoteFor(tea.id)

    const tooMuch = await cashier.api.payments.qr.post({ amountSatang: 4501, quoteId: quote.id })
    expect(tooMuch.status).toBe(409)
    expect(tooMuch.error?.value).toMatchObject({ code: 'QUOTE_AMOUNT_MISMATCH' })
    expect(fakeScb.created.size).toBe(0)
    expect(await statusOf(quote.id)).toBe('open')

    const qr = await createQr(3000, quote.id)
    await customerPays(qr)
    const sale = ok(
      await cashier.api.sales.post({
        items: lines(tea.id), payments: [...promptpay(3000, qr.id), ...cash(1500)], quoteId: quote.id,
      }),
    )
    expect(sale).toMatchObject({ totalSatang: 4500, paidSatang: 4500, changeSatang: 0 })
  })

  test('a changed cart is refused without losing the quote or the money', async () => {
    const { tea } = await shop()
    const quote = await quoteFor(tea.id)
    const qr = await createQr(4500, quote.id)
    await customerPays(qr)

    const wrong = await cashier.api.sales.post({ items: lines(tea.id, 3), payments: promptpay(4500, qr.id), quoteId: quote.id })
    expect(wrong.status).toBe(409)
    expect(wrong.error?.value).toMatchObject({ code: 'QUOTE_MISMATCH' })
    expect(await statusOf(quote.id)).toBe('reserved')
    expect(ok(await cashier.api.payments.qr({ id: qr.id }).get())).toMatchObject({ status: 'paid', saleId: null })

    ok(await cashier.api.sales.post({ items: lines(tea.id), payments: promptpay(4500, qr.id), quoteId: quote.id }))
    expect(await statusOf(quote.id)).toBe('consumed')
  })

  test('cannot be used without its quote, and says which quote that is', async () => {
    const { tea } = await shop()
    const quote = await quoteFor(tea.id)
    const qr = await createQr(4500, quote.id)
    await customerPays(qr)

    const refused = await cashier.api.sales.post({ items: lines(tea.id), payments: promptpay(4500, qr.id) })

    expect(refused.status).toBe(409)
    expect(refused.error?.value).toMatchObject({ code: 'QUOTE_REQUIRED', params: { quoteId: quote.id } })
    expect(await statusOf(quote.id)).toBe('reserved')
    expect(await stockOf(tea.id)).toBe(10)
  })

  test('another quote cannot be paid with it', async () => {
    const { tea } = await shop()
    const first = await quoteFor(tea.id)
    const second = await quoteFor(tea.id)
    const qr = await createQr(4500, first.id)
    await customerPays(qr)

    const wrongQuote = await cashier.api.sales.post({ items: lines(tea.id), payments: promptpay(4500, qr.id), quoteId: second.id })
    expect(wrongQuote.status).toBe(409)
    expect(wrongQuote.error?.value).toMatchObject({ code: 'QUOTE_MISMATCH' })
  })

  test('a quote is held by one QR at a time, and cancelling the QR cancels the quote it held', async () => {
    const { tea } = await shop()
    const quote = await quoteFor(tea.id)
    const qr = await createQr(4500, quote.id)

    const second = await cashier.api.payments.qr.post({ amountSatang: 4500, quoteId: quote.id })
    expect(second.status).toBe(409)
    expect(second.error?.value).toMatchObject({ code: 'QUOTE_NOT_OPEN' })
    const cancelByTill = await cashier.api.quotes({ id: quote.id }).cancel.post()
    expect(cancelByTill.error?.value).toMatchObject({ code: 'QUOTE_NOT_OPEN' })

    ok(await cashier.api.payments.qr({ id: qr.id }).cancel.post())
    expect(await statusOf(quote.id)).toBe('cancelled')
    // A cancelled quote is not sold, even to the same cart: the till asks for a new price.
    const late = await cashier.api.sales.post({ items: lines(tea.id), payments: cash(5000), quoteId: quote.id })
    expect(late.error?.value).toMatchObject({ code: 'QUOTE_NOT_OPEN' })
    ok(await cashier.api.sales.post({ items: lines(tea.id), payments: cash(5000), quoteId: (await quoteFor(tea.id)).id }))
  })

  test('a cash sale cannot use a quote that a QR is holding', async () => {
    const { tea } = await shop()
    const quote = await quoteFor(tea.id)
    await createQr(4500, quote.id)

    const refused = await cashier.api.sales.post({ items: lines(tea.id), payments: cash(5000), quoteId: quote.id })

    expect(refused.status).toBe(409)
    expect(refused.error?.value).toMatchObject({ code: 'QUOTE_NOT_OPEN' })
  })

  test('still sells when the member was switched off while the customer paid', async () => {
    const { tea } = await shop()
    const member = ok(await cashier.api.members.post({ name: 'ลูกค้าประจำ', phone: '0812345678' }))
    const quote = await quoteFor(tea.id, 2, { memberId: member.id })
    const qr = await createQr(4500, quote.id)
    ok(await owner.api.members({ id: member.id }).patch({ isActive: false }))
    await customerPays(qr)

    const sale = ok(
      await cashier.api.sales.post({
        items: lines(tea.id), payments: promptpay(4500, qr.id), quoteId: quote.id, memberId: member.id,
      }),
    )

    expect(sale.member).toMatchObject({ id: member.id, name: 'ลูกค้าประจำ' })
  })
})

describe('an order at a pinned price', () => {
  async function orderWithQuote() {
    const { tea } = await shop()
    const order = ok(await cashier.api.orders.post({ items: lines(tea.id) }))
    const quote = ok(await cashier.api.quotes.post({ orderId: order.id }))
    return { tea, order, quote }
  }

  test('is paid with the quote at the price the order quoted', async () => {
    const { tea, order, quote } = await orderWithQuote()
    ok(await owner.api.catalog.products({ id: tea.id }).patch({ priceSatang: 9000 }))

    const sale = ok(await cashier.api.orders({ id: order.id }).pay.post({ payments: cash(5000), quoteId: quote.id }))

    expect(sale).toMatchObject({ totalSatang: 4500, discountSatang: 500, promotion: { name: 'ลด 10%' } })
    expect(ok(await cashier.api.orders({ id: order.id }).get())).toMatchObject({ status: 'paid', saleId: sale.id })
    expect(await statusOf(quote.id)).toBe('consumed')
  })

  test('cannot be changed, renamed, moved or cancelled while a QR waits on it, and can be paid with that QR', async () => {
    const { tea, order, quote } = await orderWithQuote()
    const qr = await createQr(4500, quote.id)

    const edits = [
      await cashier.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 1 }),
      await cashier.api.orders({ id: order.id }).patch({ label: 'โต๊ะ 9' }),
      await cashier.api.orders({ id: order.id }).cancel.post({ reason: 'ลูกค้าเปลี่ยนใจ' }),
      await cashier.api.orders({ id: order.id }).pay.post({ payments: cash(5000) }),
    ]
    for (const edit of edits) {
      expect(edit.status).toBe(409)
      expect(edit.error?.value).toMatchObject({ code: 'ORDER_LOCKED_BY_QR_PAYMENT' })
    }
    expect(ok(await cashier.api.orders({ id: order.id }).get())).toMatchObject({ status: 'open', label: null })
    expect(await stockOf(tea.id)).toBe(10)

    await customerPays(qr)
    const sale = ok(await cashier.api.orders({ id: order.id }).pay.post({ payments: promptpay(4500, qr.id), quoteId: quote.id }))
    expect(sale.totalSatang).toBe(4500)
  })

  test('is editable again once the QR is cancelled', async () => {
    const { tea, order, quote } = await orderWithQuote()
    const qr = await createQr(4500, quote.id)
    ok(await cashier.api.payments.qr({ id: qr.id }).cancel.post())

    const added = ok(await cashier.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 1 }))

    expect(added.items[0]).toMatchObject({ quantity: 3 })
    // The quote no longer matches the order, which is how the till learns to ask for a new one.
    const stale = await cashier.api.orders({ id: order.id }).pay.post({ payments: cash(9000), quoteId: quote.id })
    expect(stale.error?.value).toMatchObject({ code: 'QUOTE_NOT_OPEN' })
  })
})
