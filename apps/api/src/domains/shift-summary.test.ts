import { describe, expect, test } from 'bun:test'
import { buildShiftSummary, voidedAfterCutoff, type ShiftCashTotals, type ShiftSalesTotals } from './shift-summary'

const sales = (overrides: Partial<ShiftSalesTotals> = {}): ShiftSalesTotals => ({
  saleCount: 0,
  grossSalesSatang: 0,
  voidedCount: 0,
  voidedSatang: 0,
  changeSatang: 0,
  tendered: [],
  ...overrides,
})
const cash = (overrides: Partial<ShiftCashTotals> = {}): ShiftCashTotals => ({
  cashSaleSatang: 0,
  cashInSatang: 0,
  cashOutSatang: 0,
  cashRefundSatang: 0,
  ...overrides,
})

describe('buildShiftSummary', () => {
  test('an untouched shift expects its opening cash', () => {
    expect(buildShiftSummary(10_000, sales(), cash())).toMatchObject({ expectedCashSatang: 10_000, netSalesSatang: 0 })
  })

  test('a 750 sale paid with 1,000 cash puts 750 in the drawer, not 1,000', () => {
    const summary = buildShiftSummary(
      0,
      sales({ saleCount: 1, grossSalesSatang: 75_000, changeSatang: 25_000, tendered: [{ method: 'cash', amountSatang: 100_000 }] }),
      cash({ cashSaleSatang: 75_000 }),
    )

    expect(summary.expectedCashSatang).toBe(75_000)
  })

  test('cash in adds, cash out and refunds take away', () => {
    const summary = buildShiftSummary(
      10_000,
      sales(),
      cash({ cashSaleSatang: 5_000, cashInSatang: 2_000, cashOutSatang: 1_500, cashRefundSatang: 500 }),
    )

    expect(summary.expectedCashSatang).toBe(15_000)
  })

  test('a voided sale stays in the gross, is reported apart, and takes no cash out by itself', () => {
    const summary = buildShiftSummary(
      0,
      sales({ saleCount: 2, grossSalesSatang: 3_000, voidedCount: 1, voidedSatang: 1_000 }),
      cash({ cashSaleSatang: 3_000 }),
    )

    expect(summary).toMatchObject({ grossSalesSatang: 3_000, voidedSatang: 1_000, netSalesSatang: 2_000, expectedCashSatang: 3_000 })
  })

  test('carries the tenders through unchanged', () => {
    const tendered = [
      { method: 'cash' as const, amountSatang: 600 },
      { method: 'promptpay' as const, amountSatang: 500 },
    ]

    expect(buildShiftSummary(0, sales({ tendered }), cash()).tendered).toEqual(tendered)
  })
})

describe('voidedAfterCutoff', () => {
  const frozen = buildShiftSummary(0, sales({ saleCount: 3, grossSalesSatang: 3_000, voidedCount: 1, voidedSatang: 1_000 }), cash())

  test('is nothing when no sale was voided since', () => {
    expect(voidedAfterCutoff(frozen, sales({ voidedCount: 1, voidedSatang: 1_000 }))).toEqual({ count: 0, amountSatang: 0 })
  })

  test('counts only the sales voided after the summary was frozen', () => {
    expect(voidedAfterCutoff(frozen, sales({ voidedCount: 3, voidedSatang: 3_000 }))).toEqual({ count: 2, amountSatang: 2_000 })
  })
})
