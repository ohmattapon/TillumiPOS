import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { lineIdentity } from '../../../../domains/order.domain'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { kitchenTicketsToken } from '../ports/kitchen-tickets.port'
import type { IKitchenTickets } from '../ports/kitchen-tickets.port'
import { orderRepositoryToken } from '../ports/order.repository'
import type { IOrderRepository } from '../ports/order.repository'
import { setOrderLineNoteSchema } from '../schemas/order-schemas'
import { inBranch } from '../services/order-access'

/** Command: writes or clears the note of one line. A line the kitchen has is frozen, so the screen matches what was sent. */
@injectable()
export class SetOrderLineNoteUseCase {
  constructor(
    @inject(orderRepositoryToken) private readonly orders: IOrderRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(kitchenTicketsToken) private readonly kitchen: IKitchenTickets,
  ) {}

  async execute(id: number, lineId: number, input: unknown, branchId: number) {
    const { note } = setOrderLineNoteSchema.parse(input)

    return this.unitOfWork.run(async () => {
      const order = inBranch(await this.orders.findByIdForUpdate(id), branchId)
      const line = order.items.find((item) => item.lineId === lineId)
      if (line) {
        const sent = (await this.kitchen.sentByLine([id])).get(id)?.get(lineIdentity(line.productId, line.options)) ?? 0
        if (sent > 0) throw new DomainConflictError('รายการนี้ส่งครัวแล้ว แก้หมายเหตุไม่ได้', 'KITCHEN_LINE_SENT')
      }
      return this.orders.save(order.setLineNote(lineId, note))
    })
  }
}
