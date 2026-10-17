import { describe, expect, test } from 'bun:test'
import { ShiftEntity, type ShiftProps } from './shift.domain'

const opened = (overrides: Partial<ShiftProps> = {}) => {
  const props: ShiftProps = {
    id: 1,
    branchId: 1,
    registerId: 1,
    status: 'open',
    openedAt: new Date('2026-10-13T01:00:00Z'),
    openedById: 7,
    openedByName: 'สมชาย',
    openingCashSatang: 10000,
    openingNote: null,
    currency: 'THB',
    timeZone: 'Asia/Bangkok',
    closingRevision: 0,
    closingStartedAt: null,
    closingStartedById: null,
    closingStartedByName: null,
    closedAt: null,
    closedById: null,
    closedByName: null,
    countedCashSatang: null,
    cashDifferenceSatang: null,
    differenceReason: null,
    ...overrides,
    closingExpectedCashSatang: overrides.closingExpectedCashSatang ?? null,
  }
  return new ShiftEntity(props)
}

describe('ShiftEntity', () => {
  test('starts a new count with an incremented revision', () => {
    const closing = opened().startClosing(8, 'สมหญิง', new Date('2026-10-13T02:00:00Z'), 10000)

    expect(closing.toSnapshot()).toMatchObject({
      status: 'closing',
      closingRevision: 1,
      closingStartedById: 8,
    })
  })

  test('canceling a count restores the open state and preserves the revision', () => {
    const reopened = opened()
      .startClosing(8, 'สมหญิง', new Date('2026-10-13T02:00:00Z'), 10000)
      .cancelClosing(1)

    expect(reopened.toSnapshot()).toMatchObject({ status: 'open', closingRevision: 1, closingStartedAt: null })
  })

  test('rejects a stale closing revision', () => {
    expect(() => opened().startClosing(8, 'สมหญิง', new Date(), 10000).close(0, 10000, '', 8, 'สมหญิง', new Date())).toThrow('รอบการนับ')
  })

  test('requires a reason when counted cash differs from expected cash', () => {
    const closing = opened().startClosing(8, 'สมหญิง', new Date(), 10000)

    expect(() => closing.close(1, 9000, '', 8, 'สมหญิง', new Date())).toThrow('เหตุผล')
  })

  test('closes with a signed cash difference', () => {
    const closed = opened().startClosing(8, 'สมหญิง', new Date(), 10000).close(1, 9000, 'เงินขาด 10 บาท', 8, 'สมหญิง', new Date())

    expect(closed.toSnapshot()).toMatchObject({
      status: 'closed',
      countedCashSatang: 9000,
      cashDifferenceSatang: -1000,
      differenceReason: 'เงินขาด 10 บาท',
    })
  })

  test('calculates cash expected from net entries and rejects overflow/overdraw', () => {
    expect(opened().expectedCashSatang([{ amountSatang: 750 }, { amountSatang: -250 }])).toBe(10500)
    expect(() => opened({ openingCashSatang: 0 }).expectedCashSatang([{ amountSatang: -1 }])).toThrow('เงินสดในลิ้นชักไม่พอ')
    expect(() => opened().expectedCashSatang([{ amountSatang: 2_147_483_647 }])).toThrow('ยอดเงินเกิน')
  })
})
