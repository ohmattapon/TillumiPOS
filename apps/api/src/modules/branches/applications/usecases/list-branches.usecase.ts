import { inject, injectable } from 'tsyringe'
import type { UserEntityProps } from '../../../../domains/user.domain'
import { branchRepositoryToken } from '../ports/branch.repository'
import type { IBranchRepository } from '../ports/branch.repository'

/** Query: an owner sees every branch; anyone else sees only the branch they work in. */
@injectable()
export class ListBranchesUseCase {
  constructor(@inject(branchRepositoryToken) private readonly branches: IBranchRepository) {}

  async execute(user: Pick<UserEntityProps, 'role' | 'branchId'>) {
    const all = await this.branches.findAll()
    return user.role === 'owner' ? all : all.filter((branch) => branch.id === user.branchId)
  }
}
