import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import type { Page } from '../../../../domains/page'
import type { StockReceipt, StockReceiptItem } from '../../../../domains/stock-receipt.domain'
import type { IClock } from '../../../shared/ports/clock.port'
import { TOKENS } from '../../../tokens'
import type { IStockReceiptRepository } from '../../applications/ports/stock-receipt.repository'

interface StoredReceipt {
  id: number
  branchId: number
  receivedById: number
  receivedByName: string
  createdAt: string
  note: string | null
}

// Same codes and messages the API has always answered for these conflicts.
const duplicateItems = () => new DomainConflictError('รายการสินค้าในใบรับซ้ำกัน', 'DUPLICATE')
const badReference = () => new DomainConflictError('ข้อมูลอ้างอิงของใบรับสินค้าไม่ถูกต้อง', 'IN_USE')

/**
 * No-database stock receipts: one Map for headers plus one for items keyed
 * by receipt and product, ids from 1. A product appears once per receipt,
 * like the drizzle twin's (receiptId, productId) primary key.
 */
@injectable()
export class MemoryStockReceiptRepository implements IStockReceiptRepository {
  private readonly rows = new Map<number, StoredReceipt>()
  private readonly items = new Map<number, Map<number, StockReceiptItem>>()
  private nextId = 1

  constructor(@inject(TOKENS.Clock) private readonly clock: IClock) {}

  async create(receipt: Omit<StockReceipt, 'id' | 'createdAt' | 'items'>) {
    const stored: StoredReceipt = {
      id: this.nextId++,
      branchId: receipt.branchId,
      receivedById: receipt.receivedById,
      receivedByName: receipt.receivedByName,
      createdAt: this.clock.now().toISOString(),
      note: receipt.note,
    }
    this.rows.set(stored.id, stored)
    this.items.set(stored.id, new Map())
    return { ...stored, items: [] }
  }

  async appendItems(id: number, items: StockReceiptItem[]) {
    const lines = this.items.get(id)
    // The drizzle twin's foreign key answers IN_USE for an unknown receipt.
    if (!lines) throw badReference()
    const incoming = new Set<number>()
    for (const item of items) {
      if (incoming.has(item.productId) || lines.has(item.productId)) throw duplicateItems()
      incoming.add(item.productId)
    }
    for (const item of items) lines.set(item.productId, { ...item })
  }

  async findById(id: number, branchId: number) {
    const row = this.rows.get(id)
    if (!row || row.branchId !== branchId) return null
    return this.hydrate(row)
  }

  async findAll(query: { branchId: number; limit: number; offset: number }): Promise<Page<StockReceipt>> {
    const matching = [...this.rows.values()]
      .filter((row) => row.branchId === query.branchId)
      .sort((a, b) => b.id - a.id)
    return {
      items: matching.slice(query.offset, query.offset + query.limit).map((row) => this.hydrate(row)),
      total: matching.length,
    }
  }

  private hydrate(row: StoredReceipt): StockReceipt {
    const lines = [...(this.items.get(row.id)?.values() ?? [])].sort((a, b) => a.productId - b.productId)
    return { ...row, items: lines.map((item) => ({ ...item })) }
  }
}
