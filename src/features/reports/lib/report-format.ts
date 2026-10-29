/** A category row as the API sends it: `categoryId` null means the line never had a category. */
interface CategoryRow { categoryId: number | null; name: string | null }

/** An id with no name means the category was deleted after the sale; the API never sends a label, the screen does. */
export function categoryLabel(row: CategoryRow, labels: { none: string; deleted: string }): string {
  if (row.categoryId === null) return labels.none
  return row.name ?? labels.deleted
}

/** Profit as a share of net sales in basis points (2500 = 25%); null when there were no net sales. */
export function marginBp(profitSatang: number, netSalesSatang: number): number | null {
  if (netSalesSatang === 0) return null
  const bp = (profitSatang * 10000) / Math.abs(netSalesSatang)
  return Math.sign(bp) * Math.round(Math.abs(bp))
}

/** 1240 becomes "12.4%". The sign is left to the caller, which pairs it with an arrow. */
export function formatBasisPoints(bp: number): string {
  return `${(Math.abs(bp) / 100).toFixed(1)}%`
}
