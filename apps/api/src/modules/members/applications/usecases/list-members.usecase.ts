import { inject, injectable } from 'tsyringe'
import { MemberPhone } from '../../../../domains/member-phone.vo'
import { memberRepositoryToken, type IMemberRepository } from '../ports/member.repository'
import { listMembersSchema } from '../schemas/member-schemas'

/** Query. */
@injectable()
export class ListMembersUseCase {
  constructor(@inject(memberRepositoryToken) private readonly members: IMemberRepository) {}
  async execute(input: unknown) {
    const dto = listMembersSchema.parse(input)
    let search = dto.search
    // A complete formatted phone resolves to the same identity used at signup.
    // Names, codes and partial phone searches retain their original text.
    if (search && /^\+?[\d\s()\-]+$/.test(search)) {
      try { search = new MemberPhone(search).value } catch { /* Partial phone search. */ }
    }
    return this.members.find({ ...dto, search })
  }
}
