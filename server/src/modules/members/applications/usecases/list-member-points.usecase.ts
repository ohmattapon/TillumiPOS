import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { memberPointsToken, type IMemberPoints } from '../ports/member-points.port'
import { memberRepositoryToken, type IMemberRepository } from '../ports/member.repository'
import { memberIdSchema, memberPointsQuerySchema } from '../schemas/member-schemas'

/** Query: the points history of one member, newest first. */
@injectable()
export class ListMemberPointsUseCase {
  constructor(
    @inject(memberRepositoryToken) private readonly members: IMemberRepository,
    @inject(memberPointsToken) private readonly points: IMemberPoints,
  ) {}

  async execute(id: number, input: unknown) {
    memberIdSchema.parse({ id })
    const dto = memberPointsQuerySchema.parse(input)
    if (!await this.members.findById(id)) throw new DomainNotFoundError('ไม่พบสมาชิก', 'MEMBER_NOT_FOUND')
    return this.points.listMovements(id, dto)
  }
}
