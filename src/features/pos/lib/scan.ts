import type { ProductPack } from '@pos/api/packs'
import type { Product } from '@pos/api/types'

export type ScanMatch =
  /** The product is sold on its own. */
  | { kind: 'product'; product: Product }
  /** The code is a pack's barcode and the pack can be sold. */
  | { kind: 'pack'; product: Product; pack: ProductPack }
  /** The code is a pack's barcode but the pack is no longer sold. */
  | { kind: 'inactivePack'; product: Product; pack: ProductPack }
  | { kind: 'none' }

/**
 * Decides what a scanned code sells. The product's own barcode wins, then a pack of any product,
 * then the SKU. A disabled pack stops the search: the same code must never quietly sell the pieces
 * instead. A code that matches nothing is sold only when the search left one product.
 */
export function matchScan(code: string, exact: { items: readonly Product[]; total: number }): ScanMatch {
  const term = code.trim()
  if (term === '') return { kind: 'none' }

  const ownBarcode = exact.items.find((product) => product.barcode === term)
  if (ownBarcode) return { kind: 'product', product: ownBarcode }

  for (const product of exact.items) {
    const pack = product.packs.find((entry) => entry.barcode === term)
    if (pack && !pack.isActive) return { kind: 'inactivePack', product, pack }
    if (pack) return { kind: 'pack', product, pack }
  }

  const sku = exact.items.find((product) => product.sku.toLowerCase() === term.toLowerCase())
  if (sku) return { kind: 'product', product: sku }

  return exact.total === 1 && exact.items.length === 1
    ? { kind: 'product', product: exact.items[0] }
    : { kind: 'none' }
}
