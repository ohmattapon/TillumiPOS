import { DomainError } from './errors/domain-error'

export const POSTGRES_INT_MAX = 2_147_483_647
/** `packId` means the quantity counts packs of that pack instead of single pieces. */
export interface ReceiptQuantity { productId: number; quantity: number; packId?: number }
export interface StockReceiptItem extends ReceiptQuantity { sku: string; name: string; balanceAfter: number }
export interface StockReceipt {
  id: number
  branchId: number
  receivedById: number
  receivedByName: string
  createdAt: string
  note: string | null
  items: StockReceiptItem[]
}
export const invalidReceiptItems = (ids: number[]) => new DomainError(
  `ไม่สามารถรับเข้าสินค้ารหัส ${[...new Set(ids)].sort((a, b) => a - b).join(', ')} ได้ กรุณาตรวจสอบสินค้า การนับสต็อก และจำนวน`,
  'STOCK_RECEIPT_INVALID_ITEMS', { productIds: [...new Set(ids)].sort((a, b) => a - b).join(',') },
)
/** One pack line holds `quantity` packs, so the stock moves by the pieces inside them. */
export function receiptPieces(quantity: number, packSize: number, productId: number): number {
  const pieces = quantity * packSize
  if (!Number.isInteger(pieces) || pieces < 1 || pieces > POSTGRES_INT_MAX) throw invalidReceiptItems([productId])
  return pieces
}
/** The receipt keeps the pieces it moved, and the note keeps how they arrived. */
export function packReceiptNote(note: string | null, quantity: number, pack: { barcode: string; size: number }): string {
  const received = `รับ ${quantity} ลัง (${pack.barcode}) = ${quantity * pack.size} ชิ้น`
  return note ? `${note} · ${received}` : received
}
export function normalizeReceiptItems(items: readonly ReceiptQuantity[]): ReceiptQuantity[] {
  const combined = new Map<string, ReceiptQuantity>()
  for (const item of items) {
    // A pack line and a piece line of the same product stay two lines: they arrive as different things.
    const key = `${item.productId}:${item.packId ?? 0}`
    const current = combined.get(key)
    combined.set(key, { ...item, quantity: (current?.quantity ?? 0) + item.quantity })
  }
  const invalid = [...combined.values()].filter(item => !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > POSTGRES_INT_MAX)
  if (invalid.length) throw invalidReceiptItems(invalid.map(item => item.productId))
  return [...combined.values()]
    .sort((a, b) => a.productId - b.productId || (a.packId ?? 0) - (b.packId ?? 0))
    .map(item => (item.packId === undefined
      ? { productId: item.productId, quantity: item.quantity }
      : { productId: item.productId, quantity: item.quantity, packId: item.packId }))
}
