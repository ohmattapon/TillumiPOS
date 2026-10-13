import { inject, injectable } from 'tsyringe'
import { stockMovementRepositoryToken } from '../ports/stock-movement.repository'
import type { IStockMovementRepository } from '../ports/stock-movement.repository'
import { listStockMovementsSchema } from '../schemas/inventory-schemas'

/** Query. */
@injectable()
export class ListStockMovementsUseCase {
  constructor(@inject(stockMovementRepositoryToken) private readonly movements: IStockMovementRepository) {}

  async execute(input: unknown, branchId: number) {
    return this.movements.findAll({ ...listStockMovementsSchema.parse(input), branchId })
  }
}
