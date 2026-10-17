import type { Product } from '@pos/api/types'

export type ScanCandidate = Pick<Product, 'barcode' | 'sku' | 'packs'>
type Pack = ScanCandidate['packs'][number]

export type ScanMatch<P extends ScanCandidate> =
  | { kind: 'product'; product: P }
  | { kind: 'pack'; product: P; pack: Pack }
  | { kind: 'inactivePack'; barcode: string }
  | { kind: 'none' }

/**
 * Decides what a scanned or typed code sells. `exact` says the items came from the barcode/SKU lookup rather than a name search.
 * A switched-off pack's barcode is still found by the lookup, so it must stop here: falling through would sell one loose piece.
 */
export function matchScan<P extends ScanCandidate>(code: string, exact: boolean, result: { items: P[]; total: number }): ScanMatch<P> {
  // A product's own barcode wins over a pack that happens to share the scan.
  const own = result.items.find((product) => product.barcode === code)
  if (own) return { kind: 'product', product: own }
  for (const product of result.items) {
    const pack = product.packs.find((candidate) => candidate.barcode === code)
    if (!pack) continue
    return pack.isActive ? { kind: 'pack', product, pack } : { kind: 'inactivePack', barcode: code }
  }
  const term = code.toLowerCase()
  const bySku = exact ? result.items.find((product) => product.sku.toLowerCase() === term) : undefined
  if (bySku) return { kind: 'product', product: bySku }
  if (result.total === 1 && result.items[0]) return { kind: 'product', product: result.items[0] }
  return { kind: 'none' }
}
