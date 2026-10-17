import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { lineIdentity } from '../../../../domains/order.domain'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { kitchenTicketsToken } from '../ports/kitchen-tickets.port'
import { orderRepositoryToken } from '../ports/order.repository'
import type { IKitchenTickets } from '../ports/kitchen-tickets.port'
import type { IOrderRepository } from '../ports/order.repository'
import { splitOrderSchema } from '../schemas/order-schemas'
import { inBranch, type OrderActor } from '../services/order-access'

/**
 * Command: takes part of the lines off an open order into a new order on the same table. Refused while the
 * order has tickets pending at a station, or when a chosen line was already sent to the kitchen.
 */
@injectable()
export class SplitOrderUseCase {
  constructor(
    @inject(orderRepositoryToken) private readonly orders: IOrderRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(kitchenTicketsToken) private readonly kitchen: IKitchenTickets,
  ) {}

  async execute(id: number, input: unknown, actor: OrderActor) {
    const dto = splitOrderSchema.parse(input)

    return this.unitOfWork.run(async () => {
      const order = inBranch(await this.orders.findByIdForUpdate(id), actor.branch.id)
      if (await this.kitchen.hasPending(order.id))
        throw new DomainConflictError('ยังมีใบสั่งครัวที่ยังไม่เสร็จ แยกบิลไม่ได้', 'ORDER_KITCHEN_PENDING')

      const sent = (await this.kitchen.sentByLine([order.id])).get(order.id) ?? new Map<string, number>()
      for (const pick of dto.lines) {
        const picked = order.items.find((item) => item.lineId === pick.lineId)
        if (picked && (sent.get(lineIdentity(picked.productId, picked.options)) ?? 0) > 0)
          throw new DomainConflictError('รายการที่ส่งครัวแล้วแยกไม่ได้', 'ORDER_SPLIT_SENT')
      }

      const { remaining, created } = order.splitOff(dto.lines, actor.user, dto.label ?? null)
      await this.orders.save(remaining)
      return this.orders.create(created)
    })
  }
}
