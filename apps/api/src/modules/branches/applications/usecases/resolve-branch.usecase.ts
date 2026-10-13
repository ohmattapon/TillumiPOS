import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainForbiddenError } from '../../../../domains/errors/domain-forbidden.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { UserEntityProps } from '../../../../domains/user.domain'
import { branchRepositoryToken } from '../ports/branch.repository'
import type { IBranchRepository } from '../ports/branch.repository'

/**
 * Query: the branch a request works in. `requested` is what the client asked for (the X-Branch-Id header);
 * without it the user's own branch is used. Only an owner may work in a branch other than their own,
 * and nobody may work in a closed branch.
 */
@injectable()
export class ResolveBranchUseCase {
  constructor(@inject(branchRepositoryToken) private readonly branches: IBranchRepository) {}

  async execute(user: Pick<UserEntityProps, 'role' | 'branchId'>, requested?: number | null) {
    const branchId = requested ?? user.branchId
    if (user.role !== 'owner' && branchId !== user.branchId)
      throw new DomainForbiddenError('ไม่มีสิทธิ์ทำงานในสาขานี้', 'BRANCH_FORBIDDEN')

    const branch = await this.branches.findById(branchId)
    if (!branch) throw new DomainNotFoundError('ไม่พบสาขา', 'BRANCH_NOT_FOUND')
    if (!branch.isActive) throw new DomainConflictError('สาขานี้ปิดใช้งานแล้ว', 'BRANCH_INACTIVE')
    return branch
  }
}
