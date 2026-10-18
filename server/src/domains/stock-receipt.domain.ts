import { DomainError } from './errors/domain-error'

export const POSTGRES_INT_MAX = 2_147_483_647
export interface ReceiptQuantity { productId: number; quantity: number }
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
export function normalizeReceiptItems(items: readonly ReceiptQuantity[]): ReceiptQuantity[] {
  const combined = new Map<number, number>()
  for (const item of items) combined.set(item.productId, (combined.get(item.productId) ?? 0) + item.quantity)
  const invalid = [...combined].filter(([, quantity]) => !Number.isInteger(quantity) || quantity < 1 || quantity > POSTGRES_INT_MAX)
  if (invalid.length) throw invalidReceiptItems(invalid.map(([id]) => id))
  return [...combined].sort(([a], [b]) => a - b).map(([productId, quantity]) => ({ productId, quantity }))
}
