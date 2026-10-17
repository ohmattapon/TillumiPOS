import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { branchRepositoryToken } from '../ports/branch.repository'
import type { IBranchRepository } from '../ports/branch.repository'

/**
 * Query: the branch every request works in. The shop has one branch, MAIN, so the header the client
 * sends and the user's own branch are both ignored. Old web tabs that still send another branch id
 * therefore keep working, in MAIN.
 */
@injectable()
export class ResolveBranchUseCase {
  constructor(@inject(branchRepositoryToken) private readonly branches: IBranchRepository) {}

  async execute(_user: unknown, _requested?: number | null) {
    const branch = await this.branches.findMain()
    if (!branch) throw new DomainNotFoundError('ไม่พบสาขา', 'BRANCH_NOT_FOUND')
    return branch
  }
}
