import { and, count, desc, eq, inArray } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import type { StockReceipt, StockReceiptItem } from '../../../../domains/stock-receipt.domain'
import { stockReceiptItems, stockReceipts } from '../../../../infrastructure/database/schema/stock-receipts'
import { currentExecutor } from '../../../../libs/transaction-context'
import { isForeignKeyViolation, isUniqueViolation } from '../../../../libs/pg-error'
import type { IStockReceiptRepository } from '../../applications/ports/stock-receipt.repository'

function translate(error: unknown): never {
  if (isForeignKeyViolation(error)) throw new DomainConflictError('ข้อมูลอ้างอิงของใบรับสินค้าไม่ถูกต้อง', 'IN_USE')
  if (isUniqueViolation(error)) throw new DomainConflictError('รายการสินค้าในใบรับซ้ำกัน', 'DUPLICATE')
  throw error
}

@injectable()
export class DrizzleStockReceiptRepository implements IStockReceiptRepository {
  async create(receipt: Omit<StockReceipt, 'id' | 'createdAt' | 'items'>) {
    try {
      const [row] = await currentExecutor().insert(stockReceipts).values(receipt).returning()
      return { ...row!, createdAt: row!.createdAt.toISOString(), items: [] }
    } catch (error) { return translate(error) }
  }
  async appendItems(receiptId: number, items: StockReceiptItem[]) {
    try {
      await currentExecutor().insert(stockReceiptItems).values(items.map(item => ({ ...item, receiptId })))
    } catch (error) { translate(error) }
  }
  private async hydrate(rows: (typeof stockReceipts.$inferSelect)[]): Promise<StockReceipt[]> {
    if (!rows.length) return []
    const items = await currentExecutor().select().from(stockReceiptItems).where(inArray(stockReceiptItems.receiptId, rows.map(row => row.id))).orderBy(stockReceiptItems.productId)
    return rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString(), items: items.filter(item => item.receiptId === row.id).map(({ receiptId: _, ...item }) => item) }))
  }
  async findById(id: number, branchId: number) {
    const rows = await currentExecutor().select().from(stockReceipts).where(and(eq(stockReceipts.id, id), eq(stockReceipts.branchId, branchId)))
    return (await this.hydrate(rows))[0] ?? null
  }
  async findAll(query: { branchId: number; limit: number; offset: number }) {
    const matching = eq(stockReceipts.branchId, query.branchId)
    const rows = await currentExecutor().select().from(stockReceipts).where(matching).orderBy(desc(stockReceipts.id)).limit(query.limit).offset(query.offset)
    const [counted] = await currentExecutor().select({ total: count() }).from(stockReceipts).where(matching)
    return { items: await this.hydrate(rows), total: counted!.total }
  }
}
