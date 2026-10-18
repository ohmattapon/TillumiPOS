import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { fakeScb, SCB_ENV_KEYS } from '../../../../../test/scb-server'
import { ScbQrGateway } from './scb-qr.gateway'

const now = new Date('2026-10-13T06:01:00Z')
const gateway = () => new ScbQrGateway({ now: () => now })

beforeEach(() => {
  fakeScb.reset()
  fakeScb.enableIn(Bun.env)
})

afterEach(() => {
  for (const key of SCB_ENV_KEYS) delete Bun.env[key]
})

/** Makes a QR at the fake bank so a payment can be made against its reference. */
async function qr(amountSatang = 5000) {
  const reference = 'QRTEST' + Math.random().toString(36).slice(2, 10).toUpperCase()
  await gateway().createQr({ reference, amountSatang, branchCode: 'MAIN' })
  return reference
}

const find = (reference: string, amountSatang = 5000) =>
  gateway().findPayment({ reference, amountSatang, since: new Date('2026-10-13T06:00:00Z') })

describe('ScbQrGateway.findPayment', () => {
  test("SCB's 'does not exist' answer (404, code 1104) means not paid yet, not a failure", async () => {
    const reference = await qr()

    expect(await find(reference)).toBeNull()
  })

  test('returns what the bank reported once the customer has paid', async () => {
    const reference = await qr()
    fakeScb.pay(reference, { payerName: 'สมหญิง', at: new Date('2026-10-13T06:00:30Z') })

    expect(await find(reference)).toEqual({
      transactionId: 'FAKE-TX-1',
      amountSatang: 5000,
      paidAt: new Date('2026-10-13T06:00:30Z'),
      payerName: 'สมหญิง',
    })
  })

  test('ignores a payment of another amount and a refunded one', async () => {
    const wrong = await qr()
    fakeScb.pay(wrong, { amountSatang: 4000 })
    const refunded = await qr()
    fakeScb.pay(refunded, { reverseFlag: 'R' })

    expect(await find(wrong)).toBeNull()
    expect(await find(refunded)).toBeNull()
  })

  test('a request SCB rejects is reported as a failure, so a wrong setup is not mistaken for "not paid"', async () => {
    const reference = await qr()
    // The shop is pointed at another biller than the one the fake bank knows.
    Bun.env.SCB_BILLER_ID = '999999999999999'

    await expect(find(reference)).rejects.toMatchObject({ code: 'QR_GATEWAY_ERROR' })
  })

  test('an outage is a failure too', async () => {
    const reference = await qr()
    fakeScb.setFailing(503)

    await expect(find(reference)).rejects.toMatchObject({ code: 'QR_GATEWAY_ERROR' })
  })

  test('an outage answered with a web page instead of JSON is a failure too', async () => {
    const reference = await qr()
    fakeScb.setFailing(502, { html: true })

    await expect(find(reference)).rejects.toMatchObject({ code: 'QR_GATEWAY_ERROR' })
  })

  test('a bank that stops accepting the token gets a fresh one and the call still works', async () => {
    // One gateway throughout: it is the instance that holds the token between calls.
    const bank = gateway()
    const reference = 'QRRENEW00000001'
    await bank.createQr({ reference, amountSatang: 5000, branchCode: 'MAIN' })
    expect(fakeScb.tokensIssued).toBe(1)

    fakeScb.revokeTokens()
    const found = await bank.findPayment({ reference, amountSatang: 5000, since: now })

    expect(found).toBeNull()
    expect(fakeScb.tokensIssued).toBe(2)
  })
})
