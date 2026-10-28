import { describe, expect, test } from 'bun:test'
import { makeQrPayment } from '../__tests__/factories'
import { DomainError } from './errors/domain-error'
import { QrPaymentEntity } from './qr-payment.domain'
import { buildQrReference } from './qr-payment.domain'

const paidAt = new Date('2026-10-13T06:05:00Z')
const confirmation = { transactionId: 'TX-1', amountSatang: 5000, paidAt, payerName: 'สมหญิง' }

const codeOf = (run: () => unknown) => {
  try {
    run()
  } catch (error) {
    return (error as DomainError).code
  }
  return undefined
}

describe('buildQrReference', () => {
  test('builds a 15-character bank reference from a raw id', () => {
    expect(buildQrReference('123e4567-e89b-12d3-a456-426614174000')).toBe('QR123E4567E89B1')
  })

  test('strips hyphens and upper-cases', () => {
    expect(buildQrReference('id-1')).toBe('QRID1')
  })
})

describe('QrPaymentEntity', () => {
  test('starts pending and unused', () => {
    expect(makeQrPayment()).toMatchObject({ status: 'pending', saleId: null, bankTransactionId: null })
  })

  test.each(['', 'lower', 'HAS SPACE', 'A'.repeat(21), 'สาขา'])('rejects the reference %p', (reference) => {
    expect(codeOf(() => makeQrPayment({ reference }))).toBe('INVALID_QR_PAYMENT')
  })

  test.each([0, -5, 1.5])('rejects an amount of %p', (amountSatang) => {
    expect(codeOf(() => makeQrPayment({ amountSatang }))).toBe('INVALID_QR_PAYMENT')
  })

  test('a paid payment must carry the bank transaction and time', () => {
    expect(() => makeQrPayment({ status: 'paid', bankTransactionId: null, paidAt: null })).toThrow(DomainError)
  })

  describe('expiry and checking', () => {
    const payment = makeQrPayment({ expiresAt: new Date('2026-10-13T06:10:00Z') })

    test('expires at the given time', () => {
      expect(payment.isExpired(new Date('2026-10-13T06:09:59Z'))).toBe(false)
      expect(payment.isExpired(new Date('2026-10-13T06:10:00Z'))).toBe(true)
    })

    test('is due for a check at once if never checked, then only after the interval', () => {
      const now = new Date('2026-10-13T06:01:00Z')

      expect(payment.isDueForCheck(now, 3000)).toBe(true)
      const checked = payment.checked(now)
      expect(checked.isDueForCheck(new Date(now.getTime() + 2999), 3000)).toBe(false)
      expect(checked.isDueForCheck(new Date(now.getTime() + 3000), 3000)).toBe(true)
    })
  })

  describe('markPaid', () => {
    test('records what the bank reported', () => {
      const paid = makeQrPayment().markPaid(confirmation)

      expect(paid).toMatchObject({ status: 'paid', bankTransactionId: 'TX-1', paidAt, payerName: 'สมหญิง' })
    })

    test('is idempotent: a second confirmation changes nothing', () => {
      const paid = makeQrPayment().markPaid(confirmation)

      expect(paid.markPaid({ ...confirmation, transactionId: 'TX-2' })).toBe(paid)
    })

    test('refuses an amount that is not the QR amount', () => {
      expect(codeOf(() => makeQrPayment().markPaid({ ...confirmation, amountSatang: 4999 }))).toBe('QR_AMOUNT_MISMATCH')
    })

    test('still records money that arrived after the QR was cancelled', () => {
      const late = makeQrPayment().cancel().markPaid(confirmation)

      expect(late.status).toBe('paid')
    })
  })

  describe('cancel', () => {
    test('gives up on a pending payment', () => {
      expect(makeQrPayment().cancel().status).toBe('cancelled')
    })

    test('a payment that has arrived cannot be cancelled', () => {
      expect(codeOf(() => makeQrPayment().markPaid(confirmation).cancel())).toBe('QR_ALREADY_PAID')
    })
  })

  describe('claiming', () => {
    const paid = makeQrPayment().markPaid(confirmation)

    test('a paid, unused payment can back a sale of exactly its amount', () => {
      expect(() => paid.assertClaimable(5000)).not.toThrow()
    })

    test('a payment that has not arrived cannot', () => {
      expect(codeOf(() => makeQrPayment().assertClaimable(5000))).toBe('QR_NOT_PAID')
      expect(codeOf(() => makeQrPayment().cancel().assertClaimable(5000))).toBe('QR_NOT_PAID')
    })

    test('another amount cannot', () => {
      expect(codeOf(() => paid.assertClaimable(5001))).toBe('QR_AMOUNT_MISMATCH')
    })

    test('consume ties it to the sale, and a second use is refused', () => {
      const used = paid.consume(88)

      expect(used.saleId).toBe(88)
      expect(codeOf(() => used.assertClaimable(5000))).toBe('QR_ALREADY_USED')
      expect(codeOf(() => used.consume(89))).toBe('QR_ALREADY_USED')
    })
  })

  test('a QR can be put back together from its snapshot', () => {
    const payment = makeQrPayment().markPaid(confirmation)

    expect(new QrPaymentEntity(payment.toSnapshot())).toEqual(payment)
  })
})
