import type { Product } from '@pos/api/types'

/** Tracked products at or below this quantity are flagged as running low. */
export const LOW_STOCK_THRESHOLD = 5

export const isOutOfStock = (product: Product) => product.trackStock && product.stockQty <= 0

export const isLowStock = (product: Product) => product.trackStock && product.stockQty <= LOW_STOCK_THRESHOLD
