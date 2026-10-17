import { inject, injectable } from 'tsyringe'
import { DomainForbiddenError } from '../../../../domains/errors/domain-forbidden.error'
import { MemberEntity } from '../../../../domains/member.domain'
import type { IClock } from '../../../shared/ports/clock.port'
import { TOKENS } from '../../../tokens'
import { memberRepositoryToken, type IMemberRepository } from '../ports/member.repository'
import { createMemberSchema } from '../schemas/member-schemas'

/** Command. */
@injectable()
export class CreateMemberUseCase {
  constructor(
    @inject(memberRepositoryToken) private readonly members: IMemberRepository,
    @inject(TOKENS.Clock) private readonly clock: IClock,
  ) {}
  async execute(input: unknown, actor: { role: string }) {
    const dto = createMemberSchema.parse(input)
    if (actor.role !== 'owner' && actor.role !== 'cashier') throw new DomainForbiddenError('ไม่มีสิทธิ์สมัครสมาชิก', 'FORBIDDEN')
    const now = this.clock.now()
    return this.members.create(new MemberEntity({ ...dto, id: 0, isActive: true, createdAt: now, updatedAt: now }))
  }
}
