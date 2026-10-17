import { inject, injectable } from 'tsyringe'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { kitchenTicketsToken } from '../ports/kitchen-tickets.port'
import { orderRepositoryToken } from '../ports/order.repository'
import type { IKitchenTickets } from '../ports/kitchen-tickets.port'
import type { IOrderRepository } from '../ports/order.repository'
import { setOrderItemQuantitySchema } from '../schemas/order-schemas'
import { inBranch } from '../services/order-access'

/** Command: sets how many of one line, by its id, an open order has. */
@injectable()
export class SetOrderLineQuantityUseCase {
  constructor(
    @inject(orderRepositoryToken) private readonly orders: IOrderRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(kitchenTicketsToken) private readonly kitchen: IKitchenTickets,
  ) {}

  async execute(id: number, lineId: number, input: unknown, branchId: number) {
    const { quantity } = setOrderItemQuantitySchema.parse(input)

    return this.unitOfWork.run(async () => {
      const order = inBranch(await this.orders.findByIdForUpdate(id), branchId)
      const saved = await this.orders.save(order.setLineQuantity(lineId, quantity))
      await this.kitchen.reconcile(saved.id, saved.quantitiesByLine())
      return saved
    })
  }
}
