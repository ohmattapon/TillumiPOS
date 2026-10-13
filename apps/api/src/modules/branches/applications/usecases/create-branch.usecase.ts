import { inject, injectable } from 'tsyringe'
import { BranchEntity } from '../../../../domains/branch.domain'
import { branchRepositoryToken } from '../ports/branch.repository'
import type { IBranchRepository } from '../ports/branch.repository'
import { createBranchSchema } from '../schemas/branch-schemas'

/** Command. A new branch starts with no stock; stock arrives by receiving it there. */
@injectable()
export class CreateBranchUseCase {
  constructor(@inject(branchRepositoryToken) private readonly branches: IBranchRepository) {}

  async execute(input: unknown) {
    const dto = createBranchSchema.parse(input)

    return this.branches.create(
      new BranchEntity({
        id: 0,
        code: BranchEntity.normalizeCode(dto.code),
        name: dto.name,
        address: dto.address ?? null,
        phone: dto.phone ?? null,
        isActive: true,
      }),
    )
  }
}
