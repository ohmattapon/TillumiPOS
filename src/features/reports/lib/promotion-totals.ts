export interface PromotionTotals {
  bills: number
  discountSatang: number
  netSalesSatang: number
}

/** The footer row of the promotions table: the label, then the sums over every promotion in the period. */
export function promotionTotalsCells(label: string, totals: PromotionTotals, plain: (satang: number) => string): (string | number)[] {
  return [label, totals.bills, plain(totals.discountSatang), plain(totals.netSalesSatang)]
}

/** A table of zero promotions has nothing to total, so the empty state shows alone. */
export const hasPromotionTotals = (rowCount: number) => rowCount > 0
