import type { Product } from '@pos/api/types'

/** What a pack row holds while the owner types: everything is text until the form is saved. */
export interface PackRow {
  id?: number
  barcode: string
  size: string
  price: string
  isActive: boolean
}

export interface PackInput {
  id?: number
  barcode: string
  size: number
  priceSatang: number | null
  isActive: boolean
}

/** The API accepts at most this many packs on one product. */
export const MAX_PACKS = 10

export function toPackRows(packs: Product['packs'], formatPrice: (satang: number) => string): PackRow[] {
  return packs.map((pack) => ({
    id: pack.id,
    barcode: pack.barcode,
    size: String(pack.size),
    price: pack.priceSatang === null ? '' : formatPrice(pack.priceSatang),
    isActive: pack.isActive,
  }))
}

export function toPackInput(
  rows: PackRow[],
  parseAmount: (input: string) => number | null,
): { packs: PackInput[] } | { error: 'size' | 'price'; index: number } {
  const packs: PackInput[] = []
  for (const [index, row] of rows.entries()) {
    const barcode = row.barcode.trim()
    const size = row.size.trim()
    if (barcode === '' && size === '') continue
    if (!/^\d+$/.test(size)) return { error: 'size', index }
    const price = row.price.trim()
    const priceSatang = price === '' ? null : parseAmount(price)
    if (price !== '' && priceSatang === null) return { error: 'price', index }
    packs.push({
      ...(row.id === undefined ? {} : { id: row.id }),
      barcode,
      size: Number(size),
      priceSatang,
      isActive: row.isActive,
    })
  }
  return { packs }
}
