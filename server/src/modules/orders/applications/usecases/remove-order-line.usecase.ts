import { inject, injectable } from 'tsyringe'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { kitchenTicketsToken } from '../ports/kitchen-tickets.port'
import { orderRepositoryToken } from '../ports/order.repository'
import type { IKitchenTickets } from '../ports/kitchen-tickets.port'
import type { IOrderRepository } from '../ports/order.repository'
import { inBranch } from '../services/order-access'

/** Command: takes one line, by its id, off an open order. */
@injectable()
export class RemoveOrderLineUseCase {
  constructor(
    @inject(orderRepositoryToken) private readonly orders: IOrderRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(kitchenTicketsToken) private readonly kitchen: IKitchenTickets,
  ) {}

  async execute(id: number, lineId: number, branchId: number) {
    return this.unitOfWork.run(async () => {
      const order = inBranch(await this.orders.findByIdForUpdate(id), branchId)
      const saved = await this.orders.save(order.removeLine(lineId))
      await this.kitchen.reconcile(saved.id, saved.quantitiesByLine())
      return saved
    })
  }
}
