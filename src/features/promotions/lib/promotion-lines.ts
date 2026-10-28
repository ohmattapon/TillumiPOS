import type { PromotionLine } from '@pos/api/promotions'

/** The cart lines as a scoped promotion reads them, with each product's category from the products already loaded. */
export function promotionLines(
  lines: readonly {
    productId: number
    unitPriceSatang: number
    quantity: number
    /** A pack line counts as one line toward a bundle, never as its pack size. */
    packId: number | null
    lineTotalSatang: number
  }[],
  products: ReadonlyMap<number, { categoryId: number | null }>,
): PromotionLine[] {
  return lines.map(({ productId, unitPriceSatang, quantity, packId, lineTotalSatang }) => ({
    productId,
    categoryId: products.get(productId)?.categoryId ?? null,
    unitPriceSatang,
    quantity,
    isPack: packId !== null,
    lineTotalSatang,
  }))
}
