import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { qrPayments } from '../../infrastructure/database/schema/qr-payments'
import { shiftQrAttempts } from '../../infrastructure/database/schema/shift-qr-attempts'
import { db } from '../../libs/db'
import { fakeKbank, KBANK_ENV_KEYS } from '../../../test/kbank-server'
import { baseUrl, ok, resetDatabase, seedProduct, signIn } from '../../../test/harness'

const previousMode = Bun.env.CHECKOUT_MODE
const key = () => ({ headers: { 'idempotency-key': crypto.randomUUID() } })
let owner: Awaited<ReturnType<typeof signIn>>
let cashier: Awaited<ReturnType<typeof signIn>>
let shiftId: number
let registerId: number

beforeEach(async () => {
  Bun.env.CHECKOUT_MODE = 'shifts'
  await resetDatabase()
  fakeKbank.reset()
  fakeKbank.enableIn(Bun.env)
  owner = await signIn('owner')
  cashier = await signIn('cashier')
  registerId = ok(await owner.apiV2.registers.get()).items[0]!.id
  shiftId = ok(await cashier.apiV2.shifts.post({ registerId, openingCashSatang: 0 }, key())).id
})

afterEach(() => {
  for (const name of KBANK_ENV_KEYS) delete Bun.env[name]
  if (previousMode === undefined) delete Bun.env.CHECKOUT_MODE
  else Bun.env.CHECKOUT_MODE = previousMode
})

const qr = (api = cashier.apiV2) => api.payments.qr
const createQr = async (amountSatang: number, options = key()) => ok(await qr().post({ amountSatang, shiftId }, options))
const letTimePass = (id: number) => db.update(qrPayments).set({ lastCheckedAt: null }).where(eq(qrPayments.id, id))
const promptpay = (amountSatang: number, qrPaymentId: number) => [{ method: 'promptpay' as const, amountSatang, qrPaymentId }]

/** The customer pays at the bank and the till's next refresh records it. */
async function customerPays(payment: { id: number; reference: string }) {
  fakeKbank.pay(payment.reference)
  await letTimePass(payment.id)
  return ok(await qr()({ id: payment.id }).refresh.post())
}

const startClosing = (body: { acknowledgePendingQr?: boolean } = {}) =>
  cashier.apiV2.shifts({ id: shiftId })['start-closing'].post(body, key())

describe('asking for a QR in a shift', () => {
  test('records the shift that asked, and shows the QR', async () => {
    const created = await createQr(5000)

    expect(created).toMatchObject({ status: 'pending', amountSatang: 5000, originShiftId: shiftId, saleId: null })
    expect(created.qrImage).not.toBe('')
    const [attempt] = await db.select().from(shiftQrAttempts)
    expect(attempt).toMatchObject({ state: 'ready', qrPaymentId: created.id, reference: created.reference, originShiftId: shiftId })
  })

  test('needs an open shift of this branch', async () => {
    const unknownShift = await qr().post({ amountSatang: 5000, shiftId: 9999 }, key())
    expect(unknownShift.status).toBe(404)

    ok(await startClosing())
    const closing = await qr().post({ amountSatang: 5000, shiftId }, key())
    expect(closing.status).toBe(409)
    expect(closing.error?.value).toMatchObject({ code: 'SHIFT_NOT_OPEN' })
    expect(fakeKbank.created.size).toBe(0)
  })

  test('the same key gives the same QR again without asking the bank twice', async () => {
    const options = key()
    const first = await createQr(5000, options)

    const again = await createQr(5000, options)

    expect(again).toMatchObject({ id: first.id, reference: first.reference, qrImage: first.qrImage })
    expect(fakeKbank.created.size).toBe(1)
  })

  test('a key reused for another amount is refused', async () => {
    const options = key()
    await createQr(5000, options)

    const other = await qr().post({ amountSatang: 6000, shiftId }, options)

    expect(other.status).toBe(409)
    expect(other.error?.value).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' })
  })

  test('a bank that refuses leaves a failed attempt and no payment', async () => {
    Bun.env.KBANK_MERCHANT_ID = 'wrong-merchant'

    const refused = await qr().post({ amountSatang: 5000, shiftId }, key())

    expect(refused.status).toBe(502)
    expect(refused.error?.value).toMatchObject({ code: 'QR_GATEWAY_ERROR' })
    expect((await db.select().from(shiftQrAttempts))[0]?.state).toBe('failed')
    expect(await db.select().from(qrPayments)).toEqual([])
    // Nothing is left to resolve, so the shift can be counted.
    ok(await startClosing())
  })

  test('is refused while the deployment is still in legacy mode', async () => {
    // A fresh database: no shift has ever been opened, so nothing has activated shift mode.
    await resetDatabase()
    Bun.env.CHECKOUT_MODE = 'legacy'
    const fresh = await signIn('cashier', 'legacy-cashier')

    const refused = await fresh.apiV2.payments.qr.post({ amountSatang: 5000, shiftId: 1 }, key())

    expect(refused.status).toBe(409)
    expect(refused.error?.value).toMatchObject({ code: 'CHECKOUT_MODE_REQUIRED' })
    expect(fakeKbank.created.size).toBe(0)
  })
})

describe('reading and refreshing', () => {
  test('reading never asks the bank; refreshing does and records the answer', async () => {
    const created = await createQr(5000)
    fakeKbank.pay(created.reference)
    const before = fakeKbank.requests.length

    expect(ok(await qr()({ id: created.id }).get()).status).toBe('pending')
    expect(fakeKbank.requests.length).toBe(before)

    expect(ok(await qr()({ id: created.id }).refresh.post())).toMatchObject({ status: 'paid', bankTransactionId: created.reference })
    expect(ok(await qr()({ id: created.id }).get()).status).toBe('paid')
  })

  test('a forged callback still marks nothing paid', async () => {
    const created = await createQr(5000)

    await fetch(`${baseUrl}/payments/qr/kbank/confirmation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ partnerTxnUid: created.reference }),
    })

    expect(ok(await qr()({ id: created.id }).get()).status).toBe('pending')
  })
})

describe('an unknown outcome at the bank', () => {
  test('is kept as an unresolved attempt, is not retried with the same key, and blocks counting', async () => {
    fakeKbank.loseNextCreateAnswer(true)
    const options = key()

    const lost = await qr().post({ amountSatang: 5000, shiftId }, options)
    expect(lost.status).toBe(502)
    expect(lost.error?.value).toMatchObject({ code: 'QR_PAYMENT_UNRESOLVED' })

    const retried = await qr().post({ amountSatang: 5000, shiftId }, options)
    expect(retried.status).toBe(409)
    expect(retried.error?.value).toMatchObject({ code: 'QR_PAYMENT_UNRESOLVED' })
    expect(fakeKbank.created.size).toBe(1)

    const unresolved = ok(await qr().attempts.get({ query: {} }))
    expect(unresolved.items).toMatchObject([{ state: 'unknown', amountSatang: 5000, originShiftId: shiftId }])

    const blocked = await startClosing()
    expect(blocked.status).toBe(409)
    expect(blocked.error?.value).toMatchObject({ code: 'QR_PAYMENT_UNRESOLVED' })
  })

  test('resolving asks the bank: no payment there closes the attempt as failed and frees the shift', async () => {
    fakeKbank.loseNextCreateAnswer(false)
    await qr().post({ amountSatang: 5000, shiftId }, key())
    const attempt = ok(await qr().attempts.get({ query: {} })).items[0]!

    const resolved = ok(await qr().attempts({ id: attempt.id }).resolve.post())

    expect(resolved).toMatchObject({ state: 'failed', qrPaymentId: null })
    expect(ok(await qr().attempts.get({ query: {} })).total).toBe(0)
    ok(await startClosing())
  })

  test('resolving finds money the bank did take, and records it as paid and waiting for a sale', async () => {
    fakeKbank.loseNextCreateAnswer(true)
    await qr().post({ amountSatang: 5000, shiftId }, key())
    const attempt = ok(await qr().attempts.get({ query: {} })).items[0]!
    fakeKbank.pay(attempt.reference)

    const resolved = ok(await qr().attempts({ id: attempt.id }).resolve.post())

    expect(resolved.state).toBe('ready')
    const unclaimed = ok(await qr().unclaimed.get({ query: {} }))
    expect(unclaimed.items).toMatchObject([{ id: resolved.qrPaymentId, status: 'paid', amountSatang: 5000, originShiftId: shiftId }])
  })

  test('a bank that cannot be reached leaves the attempt unresolved: a timeout proves nothing', async () => {
    fakeKbank.loseNextCreateAnswer(true)
    await qr().post({ amountSatang: 5000, shiftId }, key())
    const attempt = ok(await qr().attempts.get({ query: {} })).items[0]!
    fakeKbank.setFailing(503)

    const failed = await qr().attempts({ id: attempt.id }).resolve.post()

    expect(failed.status).toBe(502)
    expect(ok(await qr().attempts.get({ query: {} })).items[0]?.state).toBe('unknown')
  })

  test('an attempt that may still be on its way to the bank is left alone', async () => {
    await db.insert(shiftQrAttempts).values({
      originShiftId: shiftId,
      branchId: 1,
      reference: 'QRSTILLCREATING1',
      amountSatang: 5000,
      actorId: cashier.user.id,
      actorName: 'cashier',
      idempotencyKey: crypto.randomUUID(),
    })
    const attempt = ok(await qr().attempts.get({ query: {} })).items[0]!

    const early = await qr().attempts({ id: attempt.id }).resolve.post()
    expect(early.status).toBe(409)
    expect(early.error?.value).toMatchObject({ code: 'QR_ATTEMPT_IN_PROGRESS' })

    // A crash left it behind: once it is older than any call can be, it can be settled.
    await db.update(shiftQrAttempts).set({ createdAt: new Date(Date.now() - 60_000) }).where(eq(shiftQrAttempts.id, attempt.id))
    expect(ok(await qr().attempts({ id: attempt.id }).resolve.post()).state).toBe('failed')
  })
})

describe('counting a shift with QR business open', () => {
  test('a QR still waiting to be paid needs an explicit acknowledgement', async () => {
    await createQr(5000)
    await createQr(2500)

    const unacknowledged = await startClosing()
    expect(unacknowledged.status).toBe(409)
    expect(unacknowledged.error?.value).toMatchObject({
      code: 'QR_PENDING_ACKNOWLEDGEMENT_REQUIRED',
      params: { count: 2, amountSatang: 7500 },
    })

    expect(ok(await startClosing({ acknowledgePendingQr: true })).status).toBe('closing')
  })

  test('paid money without a sale blocks counting until it gets a sale', async () => {
    const tea = await seedProduct(owner, { priceSatang: 5000, stock: 3 })
    const paid = await customerPays(await createQr(5000))

    const blocked = await startClosing()
    expect(blocked.status).toBe(409)
    expect(blocked.error?.value).toMatchObject({ code: 'QR_PAYMENT_UNRESOLVED' })

    ok(await cashier.apiV2.sales.post({ items: [{ productId: tea.id, quantity: 1 }], payments: promptpay(5000, paid.id), shiftId }, key()))
    ok(await startClosing())
  })

  test('money that arrives while the drawer is being counted stops the close', async () => {
    const pending = await createQr(5000)
    const closing = ok(await startClosing({ acknowledgePendingQr: true }))
    await customerPays(pending)

    const refused = await cashier.apiV2.shifts({ id: shiftId }).close.post({ closingRevision: closing.closingRevision, countedCashSatang: 0 }, key())

    expect(refused.status).toBe(409)
    expect(refused.error?.value).toMatchObject({ code: 'QR_PAYMENT_UNRESOLVED' })
  })

  test('an owner can dismiss money that will never get a sale, with a reason, and then count', async () => {
    const paid = await customerPays(await createQr(5000))

    expect((await qr()({ id: paid.id }).dismiss.post({ reason: 'คืนเงินที่ธนาคารแล้ว' })).status).toBe(403)
    const dismissed = ok(await owner.apiV2.payments.qr({ id: paid.id }).dismiss.post({ reason: 'คืนเงินที่ธนาคารแล้ว' }))

    expect(dismissed).toMatchObject({ status: 'paid', dismissReason: 'คืนเงินที่ธนาคารแล้ว', saleId: null })
    expect(ok(await qr().unclaimed.get({ query: {} })).total).toBe(0)
    ok(await startClosing())
  })

  test('dismissed money can no longer pay for a sale', async () => {
    const tea = await seedProduct(owner, { priceSatang: 5000, stock: 3 })
    const paid = await customerPays(await createQr(5000))
    ok(await owner.apiV2.payments.qr({ id: paid.id }).dismiss.post({ reason: 'คืนเงินแล้ว' }))

    const refused = await cashier.apiV2.sales.post({ items: [{ productId: tea.id, quantity: 1 }], payments: promptpay(5000, paid.id), shiftId }, key())

    expect(refused.status).toBe(409)
    expect(refused.error?.value).toMatchObject({ code: 'QR_DISMISSED' })
  })
})

describe('late money', () => {
  test('paid after its shift closed, it waits in the branch and is sold in the next shift', async () => {
    const tea = await seedProduct(owner, { priceSatang: 5000, stock: 3 })
    const pending = await createQr(5000)
    const closing = ok(await startClosing({ acknowledgePendingQr: true }))
    ok(await cashier.apiV2.shifts({ id: shiftId }).close.post({ closingRevision: closing.closingRevision, countedCashSatang: 0 }, key()))

    // The customer pays the QR they kept, after the shift is closed.
    const paid = await customerPays(pending)
    expect(ok(await qr().unclaimed.get({ query: {} })).items).toMatchObject([{ id: paid.id, originShiftId: shiftId }])

    const nextShift = ok(await cashier.apiV2.shifts.post({ registerId, openingCashSatang: 0 }, key()))
    const sale = ok(
      await cashier.apiV2.sales.post(
        { items: [{ productId: tea.id, quantity: 1 }], payments: promptpay(5000, paid.id), shiftId: nextShift.id },
        key(),
      ),
    )

    const used = ok(await qr()({ id: paid.id }).get())
    // Where the QR was asked for and where its sale was recorded are kept apart.
    expect(used).toMatchObject({ saleId: sale.id, originShiftId: shiftId })
    expect(ok(await qr().unclaimed.get({ query: {} })).total).toBe(0)
  })

  test('a sale that fails leaves the money paid and unclaimed, never back to pending', async () => {
    const tea = await seedProduct(owner, { priceSatang: 5000, stock: 0 })
    const paid = await customerPays(await createQr(5000))

    const failed = await cashier.apiV2.sales.post({ items: [{ productId: tea.id, quantity: 1 }], payments: promptpay(5000, paid.id), shiftId }, key())

    expect(failed.error).toBeTruthy()
    expect(ok(await qr()({ id: paid.id }).get())).toMatchObject({ status: 'paid', saleId: null })
    expect(ok(await qr().unclaimed.get({ query: {} })).total).toBe(1)
  })
})
