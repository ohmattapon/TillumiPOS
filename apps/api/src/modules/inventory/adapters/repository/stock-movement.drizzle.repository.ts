import { count, desc, eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { StockMovementEntity, type NewStockMovement } from '../../../../domains/stock-movement.domain'
import { stockMovements } from '../../../../infrastructure/database/schema/stock-movements'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IFindStockMovementsQuery, IStockMovementRepository } from '../../applications/ports/stock-movement.repository'

@injectable()
export class DrizzleStockMovementRepository implements IStockMovementRepository {
  async create(movement: NewStockMovement & { balanceAfter: number }) {
    const [row] = await currentExecutor().insert(stockMovements).values(movement).returning()
    return new StockMovementEntity(row!)
  }

  async findAll(query: IFindStockMovementsQuery) {
    const matching = query.productId ? eq(stockMovements.productId, query.productId) : undefined

    const rows = await currentExecutor()
      .select()
      .from(stockMovements)
      .where(matching)
      .orderBy(desc(stockMovements.id))
      .limit(query.limit ?? 100)
      .offset(query.offset ?? 0)
    const [counted] = await currentExecutor().select({ total: count() }).from(stockMovements).where(matching)

    return { items: rows.map((row) => new StockMovementEntity(row)), total: counted!.total }
  }
}
