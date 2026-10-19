import { inject, injectable } from 'tsyringe'
import {
  StockMovementEntity,
  type NewStockMovement,
  type StockMovementEntityProps,
} from '../../../../domains/stock-movement.domain'
import type { Page } from '../../../../domains/page'
import type { IClock } from '../../../shared/ports/clock.port'
import { TOKENS } from '../../../tokens'
import type { IFindStockMovementsQuery, IStockMovementRepository } from '../../applications/ports/stock-movement.repository'

/** No-database stock ledger rows: append-only array, ids from 1. Rows are never updated or deleted. */
@injectable()
export class MemoryStockMovementRepository implements IStockMovementRepository {
  private readonly rows = new Map<number, StockMovementEntityProps>()
  private nextId = 1

  constructor(@inject(TOKENS.Clock) private readonly clock: IClock) {}

  async create(movement: NewStockMovement & { balanceAfter: number }) {
    const stored: StockMovementEntityProps = {
      id: this.nextId++,
      branchId: movement.branchId,
      productId: movement.productId,
      type: movement.type,
      quantity: movement.quantity,
      balanceAfter: movement.balanceAfter,
      reference: movement.reference ?? null,
      note: movement.note ?? null,
      userId: movement.userId,
      createdAt: this.clock.now(),
    }
    this.rows.set(stored.id, stored)
    return new StockMovementEntity(stored)
  }

  async findAll(query: IFindStockMovementsQuery): Promise<Page<StockMovementEntity>> {
    const matching = [...this.rows.values()].filter(
      (row) =>
        row.branchId === query.branchId && (query.productId === undefined || row.productId === query.productId),
    )
    const ordered = matching.sort((a, b) => b.id - a.id)
    return {
      items: ordered
        .slice(query.offset ?? 0, (query.offset ?? 0) + (query.limit ?? 100))
        .map((row) => new StockMovementEntity(row)),
      total: matching.length,
    }
  }
}
