import { inject, injectable } from 'tsyringe'
import { assertRecordable, type NewStockMovement } from '../../../../domains/stock-movement.domain'
import { productRepositoryToken } from '../../../products/applications/ports/product.repository'
import type { IProductRepository } from '../../../products/applications/ports/product.repository'
import type { IStockLedger } from '../ports/stock-ledger.port'
import { stockMovementRepositoryToken } from '../ports/stock-movement.repository'
import type { IStockMovementRepository } from '../ports/stock-movement.repository'

@injectable()
export class StockLedger implements IStockLedger {
  constructor(
    @inject(productRepositoryToken) private readonly products: IProductRepository,
    @inject(stockMovementRepositoryToken) private readonly movements: IStockMovementRepository,
  ) {}

  async record(movement: NewStockMovement) {
    assertRecordable(movement)

    const balanceAfter = await this.products.adjustStock(movement.productId, movement.branchId, movement.quantity)
    if (balanceAfter === null) return null

    return this.movements.create({ ...movement, balanceAfter })
  }
}
