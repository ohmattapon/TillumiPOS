import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { memberRepositoryToken, type IMemberRepository } from '../ports/member.repository'
import { memberIdSchema } from '../schemas/member-schemas'

/** Query. */
@injectable()
export class GetMemberUseCase {
  constructor(@inject(memberRepositoryToken) private readonly members: IMemberRepository) {}
  async execute(input: unknown) {
    const { id } = memberIdSchema.parse(input)
    const member = await this.members.findById(id)
    if (!member) throw new DomainNotFoundError('ไม่พบสมาชิก', 'MEMBER_NOT_FOUND')
    return member
  }
}
