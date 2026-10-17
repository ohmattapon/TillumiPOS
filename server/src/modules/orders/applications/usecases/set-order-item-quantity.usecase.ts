import type { IKitchenTickets } from '../ports/kitchen-tickets.port'
import type { IOrderRepository } from '../ports/order.repository'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { inBranch } from '../services/order-access'
import { inject, injectable } from 'tsyringe'
import { kitchenTicketsToken } from '../ports/kitchen-tickets.port'
import { orderRepositoryToken } from '../ports/order.repository'
import { setOrderItemQuantitySchema } from '../schemas/order-schemas'

/** Command: sets how many of a product an open order has. */
@injectable()
export class SetOrderItemQuantityUseCase {
  constructor(
    @inject(orderRepositoryToken) private readonly orders: IOrderRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(kitchenTicketsToken) private readonly kitchen: IKitchenTickets,
  ) {}

  async execute(id: number, productId: number, input: unknown, branchId: number) {
    const { quantity } = setOrderItemQuantitySchema.parse(input)

    return this.unitOfWork.run(async () => {
      const order = inBranch(await this.orders.findByIdForUpdate(id), branchId)
      const saved = await this.orders.save(order.setQuantity(productId, quantity))
      await this.kitchen.reconcile(saved.id, saved.quantitiesByLine())
      return saved
    })
  }
}
