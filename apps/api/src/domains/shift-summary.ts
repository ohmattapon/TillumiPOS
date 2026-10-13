import type { PaymentMethod } from './sale.domain'

/** What the sales of a shift add up to. Voided sales are included in the gross and reported apart. */
export interface ShiftSalesTotals {
  /** Every sale recorded in the shift, voided or not. */
  saleCount: number
  grossSalesSatang: number
  /** Sales of the shift that are voided at the moment of reading. */
  voidedCount: number
  voidedSatang: number
  /** Change handed back, over every sale of the shift. */
  changeSatang: number
  /** What customers handed over per method, before change. */
  tendered: { method: PaymentMethod; amountSatang: number }[]
}

/** Drawer movements of a shift, summed per kind. All positive. */
export interface ShiftCashTotals {
  cashSaleSatang: number
  cashInSatang: number
  cashOutSatang: number
  cashRefundSatang: number
}

/**
 * The report of a shift. While the shift is open it is worked out on demand; when counting starts it is
 * frozen, and what happens afterwards (a sale voided the next day) never rewrites it.
 * Card and PromptPay amounts are what was tied to sales, not what the bank settled.
 */
export interface ShiftSummary extends ShiftSalesTotals, ShiftCashTotals {
  /** Gross minus the sales voided at the time of the summary. */
  netSalesSatang: number
  openingCashSatang: number
  /** Opening cash + cash sales (net of change) + cash in - cash out - cash refunds. */
  expectedCashSatang: number
}

export function buildShiftSummary(
  openingCashSatang: number,
  sales: ShiftSalesTotals,
  cash: ShiftCashTotals,
): ShiftSummary {
  return {
    ...sales,
    ...cash,
    netSalesSatang: sales.grossSalesSatang - sales.voidedSatang,
    openingCashSatang,
    // The drawer follows the ledger, not the status of sales: a void takes no cash out until a refund is recorded.
    expectedCashSatang:
      openingCashSatang + cash.cashSaleSatang + cash.cashInSatang - cash.cashOutSatang - cash.cashRefundSatang,
  }
}

/** Sales of the shift that were voided after its summary was frozen. They are shown beside it, never inside it. */
export function voidedAfterCutoff(frozen: ShiftSummary, now: ShiftSalesTotals): { count: number; amountSatang: number } {
  return {
    count: Math.max(0, now.voidedCount - frozen.voidedCount),
    amountSatang: Math.max(0, now.voidedSatang - frozen.voidedSatang),
  }
}
