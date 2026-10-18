import type { PromotionLine } from '@pos/api/promotions'

/** The cart lines as a scoped promotion reads them, with each product's category from the products already loaded. */
export function promotionLines(
  lines: readonly { productId: number; lineTotalSatang: number }[],
  products: ReadonlyMap<number, { categoryId: number | null }>,
): PromotionLine[] {
  return lines.map(({ productId, lineTotalSatang }) => ({
    productId,
    categoryId: products.get(productId)?.categoryId ?? null,
    lineTotalSatang,
  }))
}
