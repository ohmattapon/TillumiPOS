import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { qrPayments } from '../../infrastructure/database/schema/qr-payments'
import { db } from '../../libs/db'
import { fakeScb, SCB_ENV_KEYS } from '../../../test/scb-server'
import { ok, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session

beforeEach(async () => {
  await resetDatabase()
  fakeScb.reset()
  fakeScb.enableIn(Bun.env)
  owner = await signIn('owner')
})

afterEach(() => {
  for (const name of SCB_ENV_KEYS) delete Bun.env[name]
})

async function paidQr(amountSatang: number) {
  const qr = ok(await owner.api.payments.qr.post({ amountSatang }))
  fakeScb.pay(qr.reference)
  await db.update(qrPayments).set({ lastCheckedAt: null }).where(eq(qrPayments.id, qr.id))
  return ok(await owner.api.payments.qr({ id: qr.id }).get())
}

describe('claiming QR payments for a sale', () => {
  test('one QR cannot pay two lines of the same bill', async () => {
    const tea = await seedProduct(owner, { priceSatang: 2000, stock: 5 })
    const qr = await paidQr(1000)

    const attempt = await owner.api.sales.post({
      items: [{ productId: tea.id, quantity: 1 }],
      payments: [
        { method: 'promptpay', amountSatang: 1000, qrPaymentId: qr.id },
        { method: 'promptpay', amountSatang: 1000, qrPaymentId: qr.id },
      ],
    })

    expect(attempt.status).toBe(400)
    expect(attempt.error?.value).toMatchObject({ code: 'QR_ALREADY_USED' })
  })

  test('two different QRs can pay one bill together', async () => {
    const tea = await seedProduct(owner, { priceSatang: 2000, stock: 5 })
    const first = await paidQr(1000)
    const second = await paidQr(1000)

    const sale = ok(await owner.api.sales.post({
      items: [{ productId: tea.id, quantity: 1 }],
      payments: [
        { method: 'promptpay', amountSatang: 1000, qrPaymentId: first.id },
        { method: 'promptpay', amountSatang: 1000, qrPaymentId: second.id },
      ],
    }))

    expect(sale.totalSatang).toBe(2000)
  })
})
