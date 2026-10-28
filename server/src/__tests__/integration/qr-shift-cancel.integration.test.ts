import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { fakeKbank, KBANK_ENV_KEYS } from '../../../test/kbank-server'
import { ok, resetDatabase, signIn, type Session } from '../../../test/harness'

const previousMode = Bun.env.CHECKOUT_MODE
const key = () => ({ headers: { 'idempotency-key': crypto.randomUUID() } })
let cashier: Session
let shiftId: number

beforeEach(async () => {
  Bun.env.CHECKOUT_MODE = 'shifts'
  await resetDatabase()
  fakeKbank.reset()
  fakeKbank.enableIn(Bun.env)
  const owner = await signIn('owner')
  cashier = await signIn('cashier')
  const registerId = ok(await owner.apiV2.registers.get()).items[0]!.id
  shiftId = ok(await cashier.apiV2.shifts.post({ registerId, openingCashSatang: 0 }, key())).id
})

afterEach(() => {
  for (const name of KBANK_ENV_KEYS) delete Bun.env[name]
  if (previousMode === undefined) delete Bun.env.CHECKOUT_MODE
  else Bun.env.CHECKOUT_MODE = previousMode
})

describe('giving up on a QR in shift mode', () => {
  test('a QR nobody paid is cancelled after the bank is asked', async () => {
    const qr = ok(await cashier.apiV2.payments.qr.post({ amountSatang: 5000, shiftId }, key()))

    const cancelled = ok(await cashier.apiV2.payments.qr({ id: qr.id }).cancel.post())

    expect(cancelled).toMatchObject({ id: qr.id, status: 'cancelled' })
  })

  test('a QR that was already paid cannot be cancelled', async () => {
    const qr = ok(await cashier.apiV2.payments.qr.post({ amountSatang: 5000, shiftId }, key()))
    fakeKbank.pay(qr.reference)

    const refused = await cashier.apiV2.payments.qr({ id: qr.id }).cancel.post()

    expect(refused.status).toBe(409)
  })
})
