import type { Page } from '../../../../domains/page'
import type { NewStockMovement, StockMovementEntity } from '../../../../domains/stock-movement.domain'

export interface IFindStockMovementsQuery {
  /** Only this branch's ledger is listed. */
  branchId: number
  productId?: number
  limit?: number
  offset?: number
}

export interface IStockMovementRepository {
  /** Appends a ledger row. Rows are never updated or deleted. */
  create(movement: NewStockMovement & { balanceAfter: number }): Promise<StockMovementEntity>
  /** One page, newest first, with the total that match. */
  findAll(query: IFindStockMovementsQuery): Promise<Page<StockMovementEntity>>
}

const stockMovementRepositoryTokenSymbol: unique symbol = Symbol('IStockMovementRepository')
export const stockMovementRepositoryToken = stockMovementRepositoryTokenSymbol.toString()
