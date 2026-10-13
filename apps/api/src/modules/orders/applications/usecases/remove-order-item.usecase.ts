import type { IOrderRepository } from '../ports/order.repository'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { inBranch } from '../services/order-access'
import { inject, injectable } from 'tsyringe'
import { orderRepositoryToken } from '../ports/order.repository'

/** Command: takes a product off an open order. */
@injectable()
export class RemoveOrderItemUseCase {
  constructor(
    @inject(orderRepositoryToken) private readonly orders: IOrderRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
  ) {}

  async execute(id: number, productId: number, branchId: number) {
    return this.unitOfWork.run(async () => {
      const order = inBranch(await this.orders.findByIdForUpdate(id), branchId)
      return this.orders.save(order.removeItem(productId))
    })
  }
}
