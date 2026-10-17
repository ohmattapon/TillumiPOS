import type { NewStockMovement, StockMovementEntity } from '../../../../domains/stock-movement.domain'

/**
 * The one way stock changes: updates the product balance and appends the ledger row together.
 * Must be called inside a unit of work, so both writes commit or roll back as one.
 * Used by other modules (sales) as well as by the inventory use cases.
 */
export interface IStockLedger {
  /** Returns null, and writes nothing, when the product does not track stock. */
  record(movement: NewStockMovement): Promise<StockMovementEntity | null>
}

const stockLedgerTokenSymbol: unique symbol = Symbol('IStockLedger')
export const stockLedgerToken = stockLedgerTokenSymbol.toString()
