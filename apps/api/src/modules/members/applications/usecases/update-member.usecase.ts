import { inject, injectable } from 'tsyringe'
import { DomainForbiddenError } from '../../../../domains/errors/domain-forbidden.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { IClock } from '../../../shared/ports/clock.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { memberRepositoryToken, type IMemberRepository } from '../ports/member.repository'
import { memberIdSchema, updateMemberSchema } from '../schemas/member-schemas'

/** Command: serialize edits with checkout's member lock. */
@injectable()
export class UpdateMemberUseCase {
  constructor(
    @inject(memberRepositoryToken) private readonly members: IMemberRepository,
    @inject(TOKENS.UnitOfWork) private readonly uow: IUnitOfWork,
    @inject(TOKENS.Clock) private readonly clock: IClock,
  ) {}
  async execute(id: number, input: unknown, actor: { role: string }) {
    const dto = updateMemberSchema.parse(input)
    memberIdSchema.parse({ id })
    if (actor.role !== 'owner') throw new DomainForbiddenError('เฉพาะเจ้าของร้านแก้ไขสมาชิกได้', 'FORBIDDEN')
    return this.uow.run(async () => {
      const member = await this.members.findByIdForUpdate(id)
      if (!member) throw new DomainNotFoundError('ไม่พบสมาชิก', 'MEMBER_NOT_FOUND')
      return this.members.update(member.with(dto, this.clock.now()))
    })
  }
}
