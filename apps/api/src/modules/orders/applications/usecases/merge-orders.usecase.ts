import { inject, injectable } from 'tsyringe'
import { DomainError } from '../../../../domains/errors/domain-error'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { orderRepositoryToken } from '../ports/order.repository'
import type { IOrderRepository } from '../ports/order.repository'
import { mergeOrdersSchema } from '../schemas/order-schemas'
import { inBranch } from '../services/order-access'

/**
 * Command: takes the lines of another open order onto this one and closes that one as merged. Both
 * rows are locked in id order, so two tills merging the orders in opposite directions cannot deadlock.
 */
@injectable()
export class MergeOrdersUseCase {
  constructor(
    @inject(orderRepositoryToken) private readonly orders: IOrderRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
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

      const merged = destination.absorb(source)
      await this.orders.save(source.markMerged(destination.id))
      return this.orders.save(merged)
    })
  }
}
