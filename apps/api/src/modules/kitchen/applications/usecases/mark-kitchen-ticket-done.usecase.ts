import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { IClock } from '../../../shared/ports/clock.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { kitchenTicketRepositoryToken } from '../ports/kitchen-ticket.repository'
import type { IKitchenTicketRepository } from '../ports/kitchen-ticket.repository'

/** Command: the kitchen marks a whole ticket as made. */
@injectable()
export class MarkKitchenTicketDoneUseCase {
  constructor(
    @inject(kitchenTicketRepositoryToken) private readonly tickets: IKitchenTicketRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(TOKENS.Clock) private readonly clock: IClock,
  ) {}

  async execute(id: number, actor: { userId: number; branchId: number }) {
    return this.unitOfWork.run(async () => {
      const ticket = await this.tickets.findByIdForUpdate(id, actor.branchId)
      if (!ticket) throw new DomainNotFoundError('ไม่พบใบสั่งครัว', 'KITCHEN_TICKET_NOT_FOUND')
      return this.tickets.save(ticket.markDone({ id: actor.userId }, this.clock.now()))
    })
  }
}
