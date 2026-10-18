import { inject, injectable } from 'tsyringe'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { orderRepositoryToken } from '../ports/order.repository'
import type { IOrderRepository } from '../ports/order.repository'
import { splitOrderSchema } from '../schemas/order-schemas'
import { inBranch, type OrderActor } from '../services/order-access'

/** Command: takes part of the lines off an open order into a new order on the same table. */
@injectable()
export class SplitOrderUseCase {
  constructor(
    @inject(orderRepositoryToken) private readonly orders: IOrderRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
  ) {}

  async execute(id: number, input: unknown, actor: OrderActor) {
    const dto = splitOrderSchema.parse(input)

    return this.unitOfWork.run(async () => {
      const order = inBranch(await this.orders.findByIdForUpdate(id), actor.branch.id)

      const { remaining, created } = order.splitOff(dto.lines, actor.user, dto.label ?? null)
      await this.orders.save(remaining)
      return this.orders.create(created)
    })
  }
}
