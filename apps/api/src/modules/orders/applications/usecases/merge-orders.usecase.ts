import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainError } from '../../../../domains/errors/domain-error'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { kitchenTicketsToken } from '../ports/kitchen-tickets.port'
import { orderRepositoryToken } from '../ports/order.repository'
import type { IKitchenTickets } from '../ports/kitchen-tickets.port'
import type { IOrderRepository } from '../ports/order.repository'
import { mergeOrdersSchema } from '../schemas/order-schemas'
import { inBranch } from '../services/order-access'

/**
 * Command: takes the lines of another open order onto this one and closes that one as merged. Both
 * rows are locked in id order, so two tills merging the orders in opposite directions cannot deadlock.
 * Refused while either order has tickets pending at a station; the source's tickets move to the destination.
 */
@injectable()
export class MergeOrdersUseCase {
  constructor(
    @inject(orderRepositoryToken) private readonly orders: IOrderRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(kitchenTicketsToken) private readonly kitchen: IKitchenTickets,
  ) {}

  async execute(id: number, input: unknown, branchId: number) {
    const { sourceOrderId } = mergeOrdersSchema.parse(input)
    if (sourceOrderId === id) throw new DomainError('รวมออเดอร์เข้ากับตัวเองไม่ได้', 'ORDER_MERGE_SAME')

    return this.unitOfWork.run(async () => {
      const [first, second] = id < sourceOrderId ? [id, sourceOrderId] : [sourceOrderId, id]
      const lockedFirst = inBranch(await this.orders.findByIdForUpdate(first), branchId)
      const lockedSecond = inBranch(await this.orders.findByIdForUpdate(second), branchId)
      const destination = first === id ? lockedFirst : lockedSecond
      const source = first === id ? lockedSecond : lockedFirst

      if ((await this.kitchen.hasPending(first)) || (await this.kitchen.hasPending(second)))
        throw new DomainConflictError('ยังมีใบสั่งครัวที่ยังไม่เสร็จ รวมบิลไม่ได้', 'ORDER_KITCHEN_PENDING')

      const merged = destination.absorb(source)
      await this.orders.save(source.markMerged(destination.id))
      await this.kitchen.moveTickets(source.id, destination.id)
      return this.orders.save(merged)
    })
  }
}
