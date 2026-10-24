import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { fakeKbank, KBANK_ENV_KEYS } from '../../../../../test/kbank-server'
import { KbankQrGateway } from './kbank-qr.gateway'

const now = new Date('2026-10-13T06:01:00Z')
const gateway = () => new KbankQrGateway({ now: () => now })

beforeEach(() => {
  fakeKbank.reset()
  fakeKbank.enableIn(Bun.env)
})

afterEach(() => {
  for (const key of KBANK_ENV_KEYS) delete Bun.env[key]
})

/** Makes a QR at the fake bank so a payment can be made against its reference. */
async function qr(amountSatang = 5000) {
  const reference = 'QRTEST' + Math.random().toString(36).slice(2, 10).toUpperCase()
  await gateway().createQr({ reference, amountSatang, branchCode: 'MAIN' })
  return reference
}

const find = (reference: string, amountSatang = 5000) =>
  gateway().findPayment({ reference, amountSatang, since: new Date('2026-10-13T06:00:00Z') })

describe('KbankQrGateway.createQr', () => {
  test('returns the EMV payload the bank answered, with a rendered picture', async () => {
    const reference = 'QRTESTCREATE01'

    const qr = await gateway().createQr({ reference, amountSatang: 5000, branchCode: 'MAIN' })

    expect(qr.qrRawData).toBe(`00020101021230TEST${reference}`)
    expect(qr.qrImage.startsWith('data:image/png;base64,')).toBe(true)
  })

  test('a lost answer whose QR the bank really made is reported as unknown, not as a plain failure', async () => {
    fakeKbank.loseNextCreateAnswer(true)

    await expect(gateway().createQr({ reference: 'QRTESTLOST00001', amountSatang: 5000, branchCode: 'MAIN' })).rejects.toMatchObject({
      code: 'QR_GATEWAY_ERROR',
      params: { outcome: 'unknown' },
    })
  })
})

describe('KbankQrGateway.findPayment', () => {
  test("a uid the bank never made (404) means not paid yet, not a failure", async () => {
    expect(await find('QRNEVER00000001')).toBeNull()
  })

  test('a QR nobody paid is REQUESTED, which also means not paid', async () => {
    const reference = await qr()

    expect(await find(reference)).toBeNull()
  })

  test('returns what the bank reported once the customer has paid', async () => {
    const reference = await qr()
    fakeKbank.pay(reference, { payerName: 'สมหญิง' })

    // The bank sends no transaction number and no payment time: the inquiry's own reference
    // identifies the money and the inquiry time stands in for when it arrived. It names no
    // payer either, so payerName stays null until a webhook carries one.
    expect(await find(reference)).toEqual({
      transactionId: reference,
      amountSatang: 5000,
      paidAt: now,
      payerName: null,
    })
  })

  test.each([
    ['cancelled', (reference: string) => fakeKbank.cancel(reference)],
    ['voided', (reference: string) => fakeKbank.void(reference)],
  ])('a %s QR holds no money to record', async (_, settle) => {
    const reference = await qr()
    settle(reference)

    expect(await find(reference)).toBeNull()
  })

  test('ignores a payment of another amount', async () => {
    const reference = await qr()
    fakeKbank.pay(reference, { amountSatang: 4000 })

    expect(await find(reference)).toBeNull()
  })

  test('a request the bank rejects is reported as a failure, so a wrong setup is not mistaken for "not paid"', async () => {
    const reference = await qr()
    // The shop is pointed at another merchant than the one the fake bank knows.
    Bun.env.KBANK_MERCHANT_ID = 'KB999999999999'

    await expect(find(reference)).rejects.toMatchObject({ code: 'QR_GATEWAY_ERROR' })
  })

  test('an outage is a failure too', async () => {
    const reference = await qr()
    fakeKbank.setFailing(503)

    await expect(find(reference)).rejects.toMatchObject({ code: 'QR_GATEWAY_ERROR' })
  })

  test('a bank that stops accepting the token gets a fresh one and the call still works', async () => {
    // One gateway throughout: it is the instance that holds the token between calls.
    const bank = gateway()
    const reference = 'QRRENEW00000001'
    await bank.createQr({ reference, amountSatang: 5000, branchCode: 'MAIN' })
    expect(fakeKbank.tokensIssued).toBe(1)

    fakeKbank.revokeTokens()
    const found = await bank.findPayment({ reference, amountSatang: 5000, since: now })

    expect(found).toBeNull()
    expect(fakeKbank.tokensIssued).toBe(2)
  })
})
