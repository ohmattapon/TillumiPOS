import { describe, expect, test } from 'bun:test'
import { makeQrPayment } from '../__tests__/factories'
import type { DomainError } from './errors/domain-error'
import { QR_ATTEMPT_STALE_AFTER_MS, QrAttemptEntity, type QrAttemptEntityProps } from './qr-attempt.domain'

const createdAt = new Date('2026-10-13T06:00:00Z')
const attempt = (overrides: Partial<QrAttemptEntityProps> = {}) =>
  new QrAttemptEntity({
    id: 1,
    originShiftId: 4,
    branchId: 1,
    reference: 'QR0123456789ABCD',
    amountSatang: 5000,
    actorId: 7,
    actorName: 'สมชาย',
    idempotencyKey: '5b0c7a36-6f0e-4a55-9a6e-0d6f3f1f6a01',
    state: 'creating',
    qrPaymentId: null,
    qrImage: null,
    createdAt,
    ...overrides,
  })

const codeOf = (run: () => unknown) => {
  try {
    run()
  } catch (error) {
    return (error as DomainError).code
  }
  return undefined
}

describe('QrAttemptEntity', () => {
  test('creating and unknown are unresolved; ready and failed are not', () => {
    expect(attempt().isUnresolved).toBe(true)
    expect(attempt({ state: 'unknown' }).isUnresolved).toBe(true)
    expect(attempt({ state: 'failed' }).isUnresolved).toBe(false)
    expect(attempt({ state: 'ready', qrPaymentId: 3 }).isUnresolved).toBe(false)
  })

  test('matches only the same shift and amount', () => {
    expect(attempt().matches({ originShiftId: 4, amountSatang: 5000 })).toBe(true)
    expect(attempt().matches({ originShiftId: 4, amountSatang: 5001 })).toBe(false)
    expect(attempt().matches({ originShiftId: 5, amountSatang: 5000 })).toBe(false)
  })

  test('becomes ready with its payment, failed, or unknown', () => {
    expect(attempt().ready(3, 'IMG')).toMatchObject({ state: 'ready', qrPaymentId: 3, qrImage: 'IMG' })
    expect(attempt().fail().state).toBe('failed')
    expect(attempt().outcomeUnknown().state).toBe('unknown')
    expect(attempt({ state: 'unknown' }).ready(3, null).state).toBe('ready')
  })

  test('a settled attempt cannot be settled again', () => {
    const failed = attempt().fail()

    expect(codeOf(() => failed.ready(3, null))).toBe('QR_ATTEMPT_RESOLVED')
    expect(codeOf(() => failed.fail())).toBe('QR_ATTEMPT_RESOLVED')
    expect(codeOf(() => failed.outcomeUnknown())).toBe('QR_ATTEMPT_RESOLVED')
  })

  test('a ready attempt must carry its payment', () => {
    expect(() => attempt({ state: 'ready', qrPaymentId: null })).toThrow()
  })

  describe('assertResolvable', () => {
    test('an unknown attempt can be resolved at once', () => {
      expect(() => attempt({ state: 'unknown' }).assertResolvable(createdAt)).not.toThrow()
    })

    test('a creating attempt is left alone until it is older than any call to the bank', () => {
      const justBefore = new Date(createdAt.getTime() + QR_ATTEMPT_STALE_AFTER_MS - 1)
      const after = new Date(createdAt.getTime() + QR_ATTEMPT_STALE_AFTER_MS)

      expect(codeOf(() => attempt().assertResolvable(justBefore))).toBe('QR_ATTEMPT_IN_PROGRESS')
      expect(() => attempt().assertResolvable(after)).not.toThrow()
    })

    test('a settled attempt is not resolvable', () => {
      expect(codeOf(() => attempt({ state: 'failed' }).assertResolvable(createdAt))).toBe('QR_ATTEMPT_RESOLVED')
    })
  })
})

describe('QrPaymentEntity: unclaimed money and dismissal', () => {
  const paid = () =>
    makeQrPayment().markPaid({ transactionId: 'TX-1', amountSatang: 5000, paidAt: createdAt, payerName: null })
  const at = new Date('2026-10-13T07:00:00Z')

  test('only paid money without a sale is unclaimed', () => {
    expect(makeQrPayment().isUnclaimed).toBe(false)
    expect(paid().isUnclaimed).toBe(true)
    expect(paid().consume(9).isUnclaimed).toBe(false)
  })

  test('dismissing records who, when and why, and keeps the payment paid', () => {
    const dismissed = paid().dismiss('คืนเงินที่ธนาคารแล้ว', 2, at)

    expect(dismissed).toMatchObject({ status: 'paid', dismissedAt: at, dismissedById: 2, dismissReason: 'คืนเงินที่ธนาคารแล้ว' })
    expect(dismissed.isUnclaimed).toBe(false)
  })

  test('dismissed money cannot pay for a sale', () => {
    const dismissed = paid().dismiss('คืนเงินแล้ว', 2, at)

    expect(codeOf(() => dismissed.assertClaimable(5000))).toBe('QR_DISMISSED')
  })

  test('only unclaimed money can be dismissed, and a reason is required', () => {
    expect(codeOf(() => makeQrPayment().dismiss('x', 2, at))).toBe('QR_NOT_UNCLAIMED')
    expect(codeOf(() => paid().consume(9).dismiss('x', 2, at))).toBe('QR_NOT_UNCLAIMED')
    expect(codeOf(() => paid().dismiss('', 2, at))).toBe('INVALID_QR_PAYMENT')
  })
})
