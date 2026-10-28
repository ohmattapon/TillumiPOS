import { inject, injectable } from 'tsyringe'
import type { MemberEntity } from '../../../../domains/member.domain'
import type { ICheckoutMembers } from '../../../sales/applications/ports/checkout-members.port'
import { memberRepositoryToken, type IMemberRepository } from '../../applications/ports/member.repository'

/**
 * Answers the sales module's question from our own repository, so a bill never
 * reads the members module's tables or ports directly.
 */
@injectable()
export class CheckoutMembersAdapter implements ICheckoutMembers {
  constructor(
    @inject(memberRepositoryToken) private readonly members: IMemberRepository,
  ) {}

  findByIdForUpdate(id: number): Promise<MemberEntity | null> {
    return this.members.findByIdForUpdate(id)
  }
}
