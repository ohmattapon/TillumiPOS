import { inject, injectable } from 'tsyringe'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { orderRepositoryToken } from '../ports/order.repository'
import type { IOrderRepository } from '../ports/order.repository'
import { setOrderLineNoteSchema } from '../schemas/order-schemas'
import { inBranch } from '../services/order-access'

/** Command: writes or clears the note of one line, such as "หวานน้อย". */
@injectable()
export class SetOrderLineNoteUseCase {
  constructor(
    @inject(orderRepositoryToken) private readonly orders: IOrderRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
  ) {}

  async execute(id: number, lineId: number, input: unknown, branchId: number) {
    const { note } = setOrderLineNoteSchema.parse(input)

    return this.unitOfWork.run(async () => {
      const order = inBranch(await this.orders.findByIdForUpdate(id), branchId)
      return this.orders.save(order.setLineNote(lineId, note))
    })
  }
}
