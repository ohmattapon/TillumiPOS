import { desc, eq } from 'drizzle-orm'
import { db, type Tx } from '../../db/client'
import { badRequest, notFound } from '../../shared/errors'
import { ProductsService } from '../catalog/products/service'
import type { AdjustStock, MovementsQuery, ReceiveStock, StockMovement } from './model'
import { stockMovements, type StockMovementType } from './schema'

interface RecordMovement {
  productId: number
  type: StockMovementType
  quantity: number
  userId: number
  reference?: string
  note?: string
}

export abstract class InventoryService {
  /**
   * Updates the product balance and appends the ledger row in the caller's transaction.
   * Returns null for products that do not track stock.
   */
  static async record(tx: Tx, input: RecordMovement): Promise<StockMovement | null> {
    const balanceAfter = await ProductsService.adjustStock(tx, input.productId, input.quantity)
    if (balanceAfter === null) return null

    const [movement] = await tx
      .insert(stockMovements)
      .values({ ...input, balanceAfter })
      .returning()
    return movement!
  }

  static receive(input: ReceiveStock, userId: number): Promise<StockMovement> {
    return db.transaction(async (tx) => {
      const [product] = await ProductsService.lockByIds(tx, [input.productId])
      if (!product) throw notFound('ไม่พบสินค้า')
      if (!product.trackStock) throw badRequest('สินค้านี้ไม่ได้ตั้งให้นับสต็อก', 'STOCK_NOT_TRACKED')

      const movement = await InventoryService.record(tx, { ...input, type: 'receive', userId })
      return movement!
    })
  }

  static adjust(input: AdjustStock, userId: number): Promise<StockMovement> {
    return db.transaction(async (tx) => {
      const [product] = await ProductsService.lockByIds(tx, [input.productId])
      if (!product) throw notFound('ไม่พบสินค้า')
      if (!product.trackStock) throw badRequest('สินค้านี้ไม่ได้ตั้งให้นับสต็อก', 'STOCK_NOT_TRACKED')

      const delta = input.countedQty - product.stockQty
      if (delta === 0) throw badRequest('ยอดที่นับได้ตรงกับยอดในระบบอยู่แล้ว', 'NO_CHANGE')

      const movement = await InventoryService.record(tx, {
        productId: input.productId,
        type: 'adjust',
        quantity: delta,
        note: input.note,
        userId,
      })
      return movement!
    })
  }

  static listMovements(query: MovementsQuery): Promise<StockMovement[]> {
    return db
      .select()
      .from(stockMovements)
      .where(query.productId ? eq(stockMovements.productId, query.productId) : undefined)
      .orderBy(desc(stockMovements.id))
      .limit(query.limit ?? 100)
  }
}
