import type { IKitchenTickets } from '../ports/kitchen-tickets.port'
import type { IOrderRepository } from '../ports/order.repository'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { inBranch } from '../services/order-access'
import { inject, injectable } from 'tsyringe'
import { kitchenTicketsToken } from '../ports/kitchen-tickets.port'
import { orderRepositoryToken } from '../ports/order.repository'

/** Command: takes a product off an open order. */
@injectable()
export class RemoveOrderItemUseCase {
  constructor(
    @inject(orderRepositoryToken) private readonly orders: IOrderRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(kitchenTicketsToken) private readonly kitchen: IKitchenTickets,
  ) {}

  async execute(id: number, productId: number, branchId: number) {
    return this.unitOfWork.run(async () => {
      const order = inBranch(await this.orders.findByIdForUpdate(id), branchId)
      const saved = await this.orders.save(order.removeItem(productId))
      await this.kitchen.reconcile(saved.id, saved.quantitiesByLine())
      return saved
    })
  }
}
