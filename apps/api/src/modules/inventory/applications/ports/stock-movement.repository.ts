import type { NewStockMovement, StockMovementEntity } from '../../../../domains/stock-movement.domain'

export interface IFindStockMovementsQuery {
  productId?: number
  limit?: number
}

export interface IStockMovementRepository {
  /** Appends a ledger row. Rows are never updated or deleted. */
  create(movement: NewStockMovement & { balanceAfter: number }): Promise<StockMovementEntity>
  /** Newest first. */
  findAll(query: IFindStockMovementsQuery): Promise<StockMovementEntity[]>
}

const stockMovementRepositoryTokenSymbol: unique symbol = Symbol('IStockMovementRepository')
export const stockMovementRepositoryToken = stockMovementRepositoryTokenSymbol.toString()
