import { inject, injectable } from 'tsyringe'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { orderRepositoryToken } from '../ports/order.repository'
import type { IOrderRepository } from '../ports/order.repository'
import { setOrderItemQuantitySchema } from '../schemas/order-schemas'
import { inBranch } from '../services/order-access'

/** Command: sets how many of one line, by its id, an open order has. */
@injectable()
export class SetOrderLineQuantityUseCase {
  constructor(
    @inject(orderRepositoryToken) private readonly orders: IOrderRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
  ) {}

  async execute(id: number, lineId: number, input: unknown, branchId: number) {
    const { quantity } = setOrderItemQuantitySchema.parse(input)

    return this.unitOfWork.run(async () => {
      const order = inBranch(await this.orders.findByIdForUpdate(id), branchId)
      return this.orders.save(order.setLineQuantity(lineId, quantity))
    })
  }
}
