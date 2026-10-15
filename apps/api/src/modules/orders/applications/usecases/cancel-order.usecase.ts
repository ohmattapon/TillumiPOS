import { inject, injectable } from 'tsyringe'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { kitchenTicketsToken } from '../ports/kitchen-tickets.port'
import { orderRepositoryToken } from '../ports/order.repository'
import type { IKitchenTickets } from '../ports/kitchen-tickets.port'
import type { IOrderRepository } from '../ports/order.repository'
import { cancelOrderSchema } from '../schemas/order-schemas'
import { inBranch, type OrderActor } from '../services/order-access'

/** Command: abandons an open order. Nothing was paid and no stock was taken; whatever the kitchen has of it is taken back. */
@injectable()
export class CancelOrderUseCase {
  constructor(
    @inject(orderRepositoryToken) private readonly orders: IOrderRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(kitchenTicketsToken) private readonly kitchen: IKitchenTickets,
  ) {}

  async execute(id: number, input: unknown, actor: OrderActor) {
    const { reason } = cancelOrderSchema.parse(input)

    return this.unitOfWork.run(async () => {
      const order = inBranch(await this.orders.findByIdForUpdate(id), actor.branch.id)
      const saved = await this.orders.save(order.cancel(reason, actor.user.id))
      await this.kitchen.reconcile(saved.id, new Map())
      return saved
    })
  }
}
