export interface ItemTotals {
  quantity: number
  pieces: number
  netSalesSatang: number
  costSatang: number
  profitSatang: number
}
export interface CategoryTotals {
  quantity: number
  netSalesSatang: number
  costSatang: number
  profitSatang: number
}

/** The last row of a table, drawn in bold. Carried in the rows so the phone list and the table both show it. */
export const isTotalRow = (row: object): row is { isTotal: true } => 'isTotal' in row

/** The totals row of the product table, shaped like a product row so the same columns draw it. */
export function itemsTotalsRow(label: string, totals: ItemTotals) {
  return { productId: 0, productName: label, sku: '', packSize: 1, vatSatang: 0, ...totals, isTotal: true as const }
}

/** The totals row of the category table. Shares of the rows do not add up to one figure, so it has none. */
export function categoriesTotalsRow(label: string, totals: CategoryTotals) {
  return { categoryId: null, name: label, vatSatang: 0, shareBp: 0, ...totals, isTotal: true as const }
}

/** The footer of the daily table: the response summary already holds the sums over every day. */
export function dailyTotalsCells(
  label: string, summary: { saleCount: number; totalSatang: number; profitSatang: number }, plain: (satang: number) => string,
): (string | number)[] {
  return [label, summary.saleCount, plain(summary.totalSatang), plain(summary.profitSatang)]
}

/** A table of zero rows has nothing to total, so the empty state shows alone. */
export const hasTotals = (rowCount: number) => rowCount > 0
