import type { Product } from '@pos/api/types'
import type { auditSchemas } from '../../server/src/modules/audit/adapters/controllers/schemas/audit.schema'
import type { AppliedCafeMenuResponse } from '../../server/src/modules/cafe-menu/adapters/controllers/schemas/cafe-menu.schema'
import type { SlideResponse } from '../../server/src/modules/display-slides/adapters/controllers/schemas/slide.schema'
import type { StockMovementResponse } from '../../server/src/modules/inventory/adapters/controllers/schemas/inventory.schema'
import type { StockReceiptResponse } from '../../server/src/modules/stock-receipts/adapters/controllers/stock-receipt.controller'

export type DemoAuditRecord = typeof auditSchemas.record.static

export interface AuditInput {
  action: string
  entityType: string
  entityId: string
  summary: string
  before?: unknown
  after?: unknown
  reason?: string | null
}

export interface AuditActor {
  id: number
  name: string
}

const minute = 60_000

/** A short history so the audit page is alive on first open; in-session actions are appended. */
export function auditSeed(): DemoAuditRecord[] {
  const now = Date.now()
  const at = (minutesAgo: number) => new Date(now - minutesAgo * minute)
  const rows: Array<AuditInput & { minutesAgo: number }> = [
    { minutesAgo: 240, action: 'shift.open', entityType: 'shift', entityId: '1', summary: 'เปิดกะเครื่องแคชเชียร์ 1' },
    { minutesAgo: 200, action: 'sale.complete', entityType: 'sale', entityId: '3', summary: 'ขายบิล MAIN-000003' },
    { minutesAgo: 150, action: 'inventory.receive', entityType: 'product', entityId: '31', summary: 'รับครัวซองต์เนยสด 20 ชิ้น' },
    { minutesAgo: 120, action: 'member.create', entityType: 'member', entityId: '2', summary: 'สมัครสมาชิกคุณมาลี' },
    { minutesAgo: 90, action: 'sale.void', entityType: 'sale', entityId: '7', summary: 'ยกเลิกบิล MAIN-000007', reason: 'ทำผิดรายการ' },
    { minutesAgo: 45, action: 'settings.update', entityType: 'settings', entityId: 'shop', summary: 'แก้ไขท้ายบิล' },
  ]
  return rows.map((row, index) => ({
    id: index + 1,
    at: at(row.minutesAgo),
    actorId: 1,
    actorName: 'เจ้าของร้าน',
    branchId: 1,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    summary: row.summary,
    before: null,
    after: null,
    reason: row.reason ?? null,
  }))
}

export function buildAuditRecord(id: number, actor: AuditActor, input: AuditInput): DemoAuditRecord {
  return {
    id,
    at: new Date(),
    actorId: actor.id,
    actorName: actor.name,
    branchId: 1,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary,
    before: input.before ?? null,
    after: input.after ?? null,
    reason: input.reason ?? null,
  }
}

/** A stock movement echo: the caller already worked out the new balance. */
export function buildMovement(
  id: number,
  input: { productId: number; type: StockMovementResponse['type']; quantity: number; balanceAfter: number; note?: string | null },
  actor: AuditActor,
): StockMovementResponse {
  return {
    id,
    branchId: 1,
    productId: input.productId,
    type: input.type,
    quantity: input.quantity,
    balanceAfter: input.balanceAfter,
    reference: null,
    note: input.note ?? null,
    userId: actor.id,
    createdAt: new Date(),
  }
}

export interface ReceiptLineInput {
  productId: number
  quantity: number
}

/**
 * A received-goods receipt: balances are taken from the live stock the caller passes,
 * so quantities visibly change on the products page after receiving.
 */
export function buildReceipt(
  id: number,
  products: Product[],
  lines: ReceiptLineInput[],
  note: string | undefined,
  actor: AuditActor,
): { receipt: StockReceiptResponse; balances: Map<number, number> } {
  const balances = new Map<number, number>()
  const items = lines.map((line) => {
    const product = products.find((item) => item.id === line.productId)
    if (!product) throw new Error(`unknown demo product ${line.productId}`)
    const balanceAfter = product.trackStock ? product.stockQty + line.quantity : product.stockQty
    balances.set(line.productId, balanceAfter)
    return { productId: product.id, quantity: line.quantity, sku: product.sku, name: product.name, balanceAfter }
  })
  return {
    receipt: {
      id,
      branchId: 1,
      receivedById: actor.id,
      receivedByName: actor.name,
      createdAt: new Date().toISOString(),
      note: note ?? null,
      items,
    },
    balances,
  }
}

// Local showcase pictures under public/demo/; nothing is fetched from outside.
export const productImages = ['/demo/product-espresso.svg', '/demo/product-matcha.svg', '/demo/product-croissant.svg']
export const slideImages = ['/demo/slide-welcome.svg', '/demo/slide-promotion.svg']

/** Two active slides, so the customer screen and the slides page have pictures. */
export function slidesSeed(): SlideResponse[] {
  return [
    { id: 1, imageUrl: slideImages[0]!, sortOrder: 1, isActive: true },
    { id: 2, imageUrl: slideImages[1]!, sortOrder: 2, isActive: true },
  ]
}

/** The cafe set is already on the menu in the showcase, so applying only skips what exists. */
export function appliedCafeMenu(itemKeys: string[]): AppliedCafeMenuResponse {
  return {
    added: { categories: 0, products: 0, groups: 0, options: 0 },
    reused: { categories: 1, groups: 2 },
    skipped: { products: itemKeys.length, items: itemKeys.map((key) => ({ key, name: key })) },
  }
}
