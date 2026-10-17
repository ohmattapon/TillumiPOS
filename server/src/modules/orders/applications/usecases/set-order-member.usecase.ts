import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { memberRepositoryToken, type IMemberRepository } from '../../../members/applications/ports/member.repository'
import { TOKENS } from '../../../tokens'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { orderRepositoryToken, type IOrderRepository } from '../ports/order.repository'
import { setOrderMemberSchema } from '../schemas/order-schemas'
import { inBranch } from '../services/order-access'

/** Command: changes membership while an order is open, under its row lock. */
@injectable()
export class SetOrderMemberUseCase {
  constructor(
    @inject(orderRepositoryToken) private readonly orders: IOrderRepository,
    @inject(memberRepositoryToken) private readonly members: IMemberRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
  ) {}
  async execute(id: number, input: unknown, branchId: number) {
    const dto = setOrderMemberSchema.parse(input)
    return this.unitOfWork.run(async () => {
      const order = inBranch(await this.orders.findByIdForUpdate(id), branchId)
      order.assertOpen()
      if (dto.memberId !== null) {
        const member = await this.members.findByIdForUpdate(dto.memberId)
        if (!member) throw new DomainNotFoundError('ไม่พบสมาชิก', 'MEMBER_NOT_FOUND')
        member.assertActive()
      }
      return this.orders.save(order.setMember(dto.memberId))
    })
  }
}
