import { inject, injectable } from 'tsyringe'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { orderRepositoryToken } from '../ports/order.repository'
import type { IOrderRepository } from '../ports/order.repository'
import { cancelOrderSchema } from '../schemas/order-schemas'
import { inBranch, type OrderActor } from '../services/order-access'

/** Command: abandons an open order. Nothing was paid and no stock was taken, so nothing needs undoing. */
@injectable()
export class CancelOrderUseCase {
  constructor(
    @inject(orderRepositoryToken) private readonly orders: IOrderRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
  ) {}

  async execute(id: number, input: unknown, actor: OrderActor) {
    const { reason } = cancelOrderSchema.parse(input)

    return this.unitOfWork.run(async () => {
      const order = inBranch(await this.orders.findByIdForUpdate(id), actor.branch.id)
      return this.orders.save(order.cancel(reason, actor.user.id))
    })
  }
}
