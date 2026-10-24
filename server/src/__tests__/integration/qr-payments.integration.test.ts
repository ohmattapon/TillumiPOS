import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { qrPayments } from '../../infrastructure/database/schema/qr-payments'
import { db } from '../../libs/db'
import { fakeScb, SCB_ENV_KEYS } from '../../../test/scb-server'
import {
  baseUrl,
  ok,
  PASSWORD,
  resetDatabase,
  seedProduct,
  signIn,
  type Session,
} from '../../../test/harness'

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

const createQr = async (amountSatang: number, api = cashier.api) => ok(await api.payments.qr.post({ amountSatang }))
const promptpay = (amountSatang: number, qrPaymentId?: number) => [
  { method: 'promptpay' as const, amountSatang, ...(qrPaymentId !== undefined && { qrPaymentId }) },
]
const cash = (amountSatang: number) => [{ method: 'cash' as const, amountSatang }]
const inquiries = () => fakeScb.requests.filter((request) => request.path.startsWith('/v1/payment/billpayment/inquiry'))

/** The polling screen asks every 3 seconds; tests do not wait, they just say the interval has passed. */
const letTimePass = (id: number) => db.update(qrPayments).set({ lastCheckedAt: null }).where(eq(qrPayments.id, id))

/** Customer pays at the bank, then the till's next poll sees it. */
async function customerPays(qr: { id: number; reference: string }, api = cashier.api) {
  fakeScb.pay(qr.reference)
  await letTimePass(qr.id)
  return ok(await api.payments.qr({ id: qr.id }).get())
}

describe('configuration', () => {
  test('reports whether QR payment is set up', async () => {
    expect(ok(await cashier.api.payments.qr.config.get())).toEqual({ enabled: true })

    for (const key of SCB_ENV_KEYS) delete Bun.env[key]
    expect(ok(await cashier.api.payments.qr.config.get())).toEqual({ enabled: false })
  })

  test('values copied from the example file do not count as configured', async () => {
    Bun.env.SCB_API_KEY = 'your-scb-api-key'

    expect(ok(await cashier.api.payments.qr.config.get())).toEqual({ enabled: false })
  })

  test('creating a QR when it is not set up is refused', async () => {
    for (const key of SCB_ENV_KEYS) delete Bun.env[key]

    const refused = await cashier.api.payments.qr.post({ amountSatang: 1000 })

    expect(refused.status).toBe(409)
    expect(refused.error?.value).toMatchObject({ code: 'QR_NOT_CONFIGURED' })
  })
})

describe('creating a QR', () => {
  test('asks the bank for the exact amount and returns what the till needs to show', async () => {
    const qr = await createQr(5025)

    expect(qr).toMatchObject({
      status: 'pending',
      amountSatang: 5025,
      saleId: null,
      bankTransactionId: null,
      qrRawData: expect.stringContaining(qr.reference),
      qrImage: expect.any(String),
    })
    expect(qr.reference).toMatch(/^QR[A-Z0-9]{13}$/)
    expect(new Date(qr.expiresAt).getTime()).toBeGreaterThan(Date.now() + 9 * 60_000)

    expect(fakeScb.created.get(qr.reference)).toEqual({
      amount: '50.25',
      ppId: fakeScb.credentials.billerId,
      // The merchant profile's prefix, then the branch the sale belongs to.
      ref3: 'TSTMAIN',
      ref2: undefined,
    })
  })

  test('sends the shop credentials only to the bank, never back to the client', async () => {
    const response = await fetch(`${baseUrl}/payments/qr`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: await cookieOf('cashier') },
      body: JSON.stringify({ amountSatang: 1000 }),
    })
    const text = await response.text()

    expect(response.status).toBe(200)
    expect(text).not.toContain(fakeScb.credentials.apiSecret)
    expect(text).not.toContain(fakeScb.credentials.apiKey)
    const sent = fakeScb.requests.find((request) => request.path === '/v1/payment/qrcode/create')!
    expect(sent.headers.resourceownerid).toBe(fakeScb.credentials.apiKey)
    expect(sent.headers.authorization).toMatch(/^Bearer token-/)
  })

  test('sends reference 2 only when the merchant profile uses two references', async () => {
    Bun.env.SCB_TWO_REFERENCES = 'true'

    const qr = await createQr(1000)

    expect(fakeScb.created.get(qr.reference)?.ref2).toBe('MAIN')
  })

  test.each([0, -100, 1.5])('refuses an amount of %p', async (amountSatang) => {
    expect((await cashier.api.payments.qr.post({ amountSatang })).error).toBeTruthy()
  })

  test('reuses the bank token, and renews it when the bank stops accepting it', async () => {
    await createQr(1000)
    await createQr(1000)
    expect(fakeScb.tokensIssued).toBe(1)

    fakeScb.revokeTokens()
    await createQr(1000)

    expect(fakeScb.tokensIssued).toBe(2)
  })

  test('a bank outage is a 502 with its own code, and stores nothing', async () => {
    fakeScb.setFailing(503)

    const failed = await cashier.api.payments.qr.post({ amountSatang: 1000 })

    expect(failed.status).toBe(502)
    expect(failed.error?.value).toMatchObject({ code: 'QR_GATEWAY_ERROR' })
    expect(await db.select().from(qrPayments)).toEqual([])
  })
})

describe('waiting for payment', () => {
  test('stays pending until the bank has the payment, then becomes paid with what the bank reported', async () => {
    const qr = await createQr(5000)
    expect(ok(await cashier.api.payments.qr({ id: qr.id }).get()).status).toBe('pending')

    const paid = await customerPays(qr)

    expect(paid).toMatchObject({
      status: 'paid',
      bankTransactionId: 'FAKE-TX-1',
      payerName: 'ลูกค้าทดสอบ',
      paidAt: expect.any(Date),
    })
  })

  test('does not ask the bank more often than every few seconds', async () => {
    const qr = await createQr(5000)

    await cashier.api.payments.qr({ id: qr.id }).get()
    await cashier.api.payments.qr({ id: qr.id }).get()
    await cashier.api.payments.qr({ id: qr.id }).get()

    expect(inquiries()).toHaveLength(1)
  })

  test('a payment of another amount is not accepted', async () => {
    const qr = await createQr(5000)
    fakeScb.pay(qr.reference, { amountSatang: 4000 })
    await letTimePass(qr.id)

    expect(ok(await cashier.api.payments.qr({ id: qr.id }).get()).status).toBe('pending')
  })

  test('a refunded payment is not accepted', async () => {
    const qr = await createQr(5000)
    fakeScb.pay(qr.reference, { reverseFlag: 'R' })
    await letTimePass(qr.id)

    expect(ok(await cashier.api.payments.qr({ id: qr.id }).get()).status).toBe('pending')
  })

  test('a payment made after midnight is still found', async () => {
    const qr = await createQr(5000)
    // Made late yesterday, paid today: the bank files it under today's date.
    await db
      .update(qrPayments)
      .set({ createdAt: new Date(Date.now() - 86_400_000), lastCheckedAt: null })
      .where(eq(qrPayments.id, qr.id))
    fakeScb.pay(qr.reference)

    expect(ok(await cashier.api.payments.qr({ id: qr.id }).get()).status).toBe('paid')
  })

  test('when the bank cannot be reached the screen keeps waiting instead of failing', async () => {
    const qr = await createQr(5000)
    fakeScb.setFailing(503)
    await letTimePass(qr.id)

    expect(ok(await cashier.api.payments.qr({ id: qr.id }).get()).status).toBe('pending')
  })

})

describe("SCB's confirmation callback", () => {
  const confirm = (body: unknown) =>
    fetch(`${baseUrl}/payments/qr/scb/confirmation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

  test('is answered the way SCB requires and marks the payment paid at once', async () => {
    const qr = await createQr(5000)
    fakeScb.pay(qr.reference)

    const response = await confirm({ billPaymentRef1: qr.reference, transactionId: 'SCB-TX-9', amount: '50.00' })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ resCode: '00', resDesc: 'success', transactionId: 'SCB-TX-9' })
    // Not through the polling throttle: the callback is the news.
    expect(ok(await cashier.api.payments.qr({ id: qr.id }).get()).status).toBe('paid')
    expect(inquiries()).toHaveLength(1)
  })

  test('a forged callback does not make anything paid: only the bank itself is believed', async () => {
    const qr = await createQr(5000)

    const response = await confirm({
      billPaymentRef1: qr.reference,
      transactionId: 'FORGED',
      amount: '50.00',
      payerName: 'ผู้ไม่หวังดี',
    })

    expect(response.status).toBe(200)
    const still = ok(await cashier.api.payments.qr({ id: qr.id }).get())
    expect(still).toMatchObject({ status: 'pending', bankTransactionId: null })
  })

  test('an unknown reference is acknowledged too, so SCB stops retrying', async () => {
    const response = await confirm({ billPaymentRef1: 'NOSUCHREF', transactionId: 'X' })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ resCode: '00' })
  })

  test('needs no session', async () => {
    const response = await confirm({})

    expect(response.status).toBe(200)
  })
})

describe('cancelling', () => {
  test('gives up on a QR that has not been paid', async () => {
    const qr = await createQr(5000)

    expect(ok(await cashier.api.payments.qr({ id: qr.id }).cancel.post()).status).toBe('cancelled')
  })

  test('checks with the bank first, so money that has just arrived is not cancelled away', async () => {
    const qr = await createQr(5000)
    fakeScb.pay(qr.reference)

    const refused = await cashier.api.payments.qr({ id: qr.id }).cancel.post()

    expect(refused.status).toBe(409)
    expect(refused.error?.value).toMatchObject({ code: 'QR_ALREADY_PAID' })
    expect(ok(await cashier.api.payments.qr({ id: qr.id }).get()).status).toBe('paid')
  })

  test('money that arrives for a cancelled QR is still recorded', async () => {
    const qr = await createQr(5000)
    ok(await cashier.api.payments.qr({ id: qr.id }).cancel.post())

    const late = await customerPays(qr)

    expect(late.status).toBe('paid')
  })
})

describe('paying a sale with a QR', () => {
  test('a confirmed QR backs the promptpay payment and is then tied to that sale', async () => {
    const tea = await seedProduct(owner, { priceSatang: 1000, stock: 5 })
    const qr = await createQr(1000)
    await customerPays(qr)

    const sale = ok(await cashier.api.sales.post({ items: [{ productId: tea.id, quantity: 1 }], payments: promptpay(1000, qr.id) }))

    expect(sale.payments).toEqual([{ method: 'promptpay', amountSatang: 1000 }])
    expect(ok(await cashier.api.payments.qr({ id: qr.id }).get())).toMatchObject({ status: 'paid', saleId: sale.id })
  })

  test('works the same for paying an open order', async () => {
    const tea = await seedProduct(owner, { priceSatang: 1000, stock: 5 })
    const order = ok(await cashier.api.orders.post({ items: [{ productId: tea.id, quantity: 1 }] }))
    const qr = await createQr(1000)
    await customerPays(qr)

    const sale = ok(await cashier.api.orders({ id: order.id }).pay.post({ payments: promptpay(1000, qr.id) }))

    expect(ok(await cashier.api.payments.qr({ id: qr.id }).get()).saleId).toBe(sale.id)
  })

  test('promptpay on trust is refused once QR payment is set up, but cash is not affected', async () => {
    const tea = await seedProduct(owner, { priceSatang: 1000, stock: 5 })
    const items = [{ productId: tea.id, quantity: 1 }]

    const refused = await cashier.api.sales.post({ items, payments: promptpay(1000) })
    expect(refused.status).toBe(400)
    expect(refused.error?.value).toMatchObject({ code: 'QR_PAYMENT_REQUIRED' })

    ok(await cashier.api.sales.post({ items, payments: cash(1000) }))
  })

  test('a QR the bank has not confirmed cannot be used', async () => {
    const tea = await seedProduct(owner, { priceSatang: 1000, stock: 5 })
    const qr = await createQr(1000)

    const refused = await cashier.api.sales.post({
      items: [{ productId: tea.id, quantity: 1 }],
      payments: promptpay(1000, qr.id),
    })

    expect(refused.status).toBe(409)
    expect(refused.error?.value).toMatchObject({ code: 'QR_NOT_PAID' })
  })

  test('a QR cannot pay two sales', async () => {
    const tea = await seedProduct(owner, { priceSatang: 1000, stock: 5 })
    const items = [{ productId: tea.id, quantity: 1 }]
    const qr = await createQr(1000)
    await customerPays(qr)
    ok(await cashier.api.sales.post({ items, payments: promptpay(1000, qr.id) }))

    const second = await cashier.api.sales.post({ items, payments: promptpay(1000, qr.id) })

    expect(second.status).toBe(409)
    expect(second.error?.value).toMatchObject({ code: 'QR_ALREADY_USED' })
  })

  test('two tills using the same QR at once make exactly one sale', async () => {
    const tea = await seedProduct(owner, { priceSatang: 1000, stock: 5 })
    const items = [{ productId: tea.id, quantity: 1 }]
    const qr = await createQr(1000)
    await customerPays(qr)
    const second = await signIn('cashier', 'cashier-2')

    const results = await Promise.all([
      cashier.api.sales.post({ items, payments: promptpay(1000, qr.id) }),
      second.api.sales.post({ items, payments: promptpay(1000, qr.id) }),
    ])

    expect(results.filter((result) => !result.error)).toHaveLength(1)
    expect(ok(await owner.api.sales.get({ query: {} })).total).toBe(1)
  })

  test('the QR amount must be exactly the amount paid by it', async () => {
    const tea = await seedProduct(owner, { priceSatang: 1000, stock: 5 })
    const qr = await createQr(2000)
    await customerPays(qr)

    const refused = await cashier.api.sales.post({
      items: [{ productId: tea.id, quantity: 1 }],
      payments: promptpay(1000, qr.id),
    })

    expect(refused.status).toBe(400)
    expect(refused.error?.value).toMatchObject({ code: 'QR_AMOUNT_MISMATCH' })
  })

  test('a sale that fails after the customer paid leaves the QR paid and usable for the corrected sale', async () => {
    const tea = await seedProduct(owner, { priceSatang: 1000, stock: 1 })
    const qr = await createQr(1000)
    await customerPays(qr)

    const failed = await cashier.api.sales.post({
      items: [{ productId: tea.id, quantity: 2 }],
      payments: promptpay(2000, qr.id),
    })
    expect(failed.error).toBeTruthy()
    expect(ok(await cashier.api.payments.qr({ id: qr.id }).get())).toMatchObject({ status: 'paid', saleId: null })

    const retried = ok(
      await cashier.api.sales.post({ items: [{ productId: tea.id, quantity: 1 }], payments: promptpay(1000, qr.id) }),
    )
    expect(ok(await cashier.api.payments.qr({ id: qr.id }).get()).saleId).toBe(retried.id)
  })

  test('without QR payment set up, promptpay is taken on trust as before', async () => {
    for (const key of SCB_ENV_KEYS) delete Bun.env[key]
    const tea = await seedProduct(owner, { priceSatang: 1000, stock: 5 })

    const sale = ok(await cashier.api.sales.post({ items: [{ productId: tea.id, quantity: 1 }], payments: promptpay(1000) }))

    expect(sale.payments[0]).toMatchObject({ method: 'promptpay' })
  })
})

/** The session cookie of a user created by signIn, for the raw-fetch checks. */
async function cookieOf(username: string): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORD }),
  })
  return response.headers.getSetCookie()[0]!.split(';')[0]!
}
