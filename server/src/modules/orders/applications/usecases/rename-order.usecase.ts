import type { IOrderRepository } from '../ports/order.repository'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { inBranch } from '../services/order-access'
import { inject, injectable } from 'tsyringe'
import { orderRepositoryToken } from '../ports/order.repository'
import { updateOrderSchema } from '../schemas/order-schemas'

/** Command: renames an open order. */
@injectable()
export class RenameOrderUseCase {
  constructor(
    @inject(orderRepositoryToken) private readonly orders: IOrderRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
  ) {}

  async execute(id: number, input: unknown, branchId: number) {
    const { label } = updateOrderSchema.parse(input)

    // Locked so two edits to the same order are applied one after the other, never over each other.
    return this.unitOfWork.run(async () => {
      const order = inBranch(await this.orders.findByIdForUpdate(id), branchId)
      return this.orders.save(order.rename(label))
    })
  }
}
