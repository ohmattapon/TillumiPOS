import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { priceQuotes } from '../../infrastructure/database/schema/price-quotes'
import { qrPayments } from '../../infrastructure/database/schema/qr-payments'
import { shiftQrAttempts } from '../../infrastructure/database/schema/shift-qr-attempts'
import { db } from '../../libs/db'
import { fakeKbank, KBANK_ENV_KEYS } from '../../../test/kbank-server'
import { ok, resetDatabase, seedProduct, signIn } from '../../../test/harness'

const previousMode = Bun.env.CHECKOUT_MODE
const key = () => ({ headers: { 'idempotency-key': crypto.randomUUID() } })
let owner: Awaited<ReturnType<typeof signIn>>
let cashier: Awaited<ReturnType<typeof signIn>>
let shiftId: number

beforeEach(async () => {
  Bun.env.CHECKOUT_MODE = 'shifts'
  await resetDatabase()
  fakeKbank.reset()
  fakeKbank.enableIn(Bun.env)
  owner = await signIn('owner')
  cashier = await signIn('cashier')
  const registerId = ok(await owner.apiV2.registers.get()).items[0]!.id
  shiftId = ok(await cashier.apiV2.shifts.post({ registerId, openingCashSatang: 0 }, key())).id
})

afterEach(() => {
  for (const name of KBANK_ENV_KEYS) delete Bun.env[name]
  if (previousMode === undefined) delete Bun.env.CHECKOUT_MODE
  else Bun.env.CHECKOUT_MODE = previousMode
})

const lines = (productId: number, quantity = 2) => [{ productId, quantity }]
const promptpay = (amountSatang: number, qrPaymentId: number) => [{ method: 'promptpay' as const, amountSatang, qrPaymentId }]
const statusOf = async (quoteId: number) => ok(await cashier.api.quotes({ id: quoteId }).get()).status

async function shop() {
  const tea = await seedProduct(owner, { priceSatang: 2500, stock: 10 })
  ok(await owner.api.promotions.post({ name: 'ลด 10%', kind: 'percent', value: 1000 }))
  const quote = ok(await cashier.api.quotes.post({ lines: lines(tea.id) }))
  return { tea, quote }
}

async function customerPays(payment: { id: number; reference: string }) {
  fakeKbank.pay(payment.reference)
  await db.update(qrPayments).set({ lastCheckedAt: null }).where(eq(qrPayments.id, payment.id))
  return ok(await cashier.apiV2.payments.qr({ id: payment.id }).refresh.post())
}

describe('a QR asked for in a shift from a quote', () => {
  test('holds the quote, is sold with it, and the sale is replayed with the same key', async () => {
    const { tea, quote } = await shop()
    const qr = ok(await cashier.apiV2.payments.qr.post({ amountSatang: 4500, shiftId, quoteId: quote.id }, key()))
    expect(await statusOf(quote.id)).toBe('reserved')
    await customerPays(qr)

    const saleKey = key()
    const body = { items: lines(tea.id), payments: promptpay(4500, qr.id), shiftId, quoteId: quote.id }
    const sale = ok(await cashier.apiV2.sales.post(body, saleKey))
    expect(sale).toMatchObject({ totalSatang: 4500, discountSatang: 500, promotion: { name: 'ลด 10%' } })
    expect(await statusOf(quote.id)).toBe('consumed')

    const replay = ok(await cashier.apiV2.sales.post(body, saleKey))
    expect(replay.id).toBe(sale.id)
  })

  test('a bank that refuses gives the quote back', async () => {
    const { quote } = await shop()
    Bun.env.KBANK_MERCHANT_ID = 'wrong-merchant'
    const refused = await cashier.apiV2.payments.qr.post({ amountSatang: 4500, shiftId, quoteId: quote.id }, key())
    expect(refused.status).toBe(502)
    expect(await statusOf(quote.id)).toBe('open')
    expect((await db.select().from(shiftQrAttempts))[0]?.state).toBe('failed')
  })

  test('the owner setting the money aside closes the quote with it', async () => {
    const { quote } = await shop()
    const qr = ok(await cashier.apiV2.payments.qr.post({ amountSatang: 4500, shiftId, quoteId: quote.id }, key()))
    await customerPays(qr)

    ok(await owner.apiV2.payments.qr({ id: qr.id }).dismiss.post({ reason: 'คืนเงินที่ธนาคารแล้ว' }))

    expect(await statusOf(quote.id)).toBe('cancelled')
  })

  test('a quote that is no longer open cannot be held', async () => {
    const { quote } = await shop()
    await db.update(priceQuotes).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(priceQuotes.id, quote.id))

    const refused = await cashier.apiV2.payments.qr.post({ amountSatang: 4500, shiftId, quoteId: quote.id }, key())

    expect(refused.status).toBe(409)
    expect(refused.error?.value).toMatchObject({ code: 'QUOTE_EXPIRED' })
    expect(fakeKbank.created.size).toBe(0)
    expect(await db.select().from(shiftQrAttempts)).toEqual([])
  })
})
