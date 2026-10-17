import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { userRepositoryToken } from '../../../users/applications/ports/user.repository'
import type { IUserRepository } from '../../../users/applications/ports/user.repository'
import { branchRepositoryToken } from '../ports/branch.repository'
import type { IBranchRepository } from '../ports/branch.repository'
import { updateBranchSchema } from '../schemas/branch-schemas'

/** Command. A branch is closed, never deleted: its sales and stock history must stay readable. */
@injectable()
export class UpdateBranchUseCase {
  constructor(
    @inject(branchRepositoryToken) private readonly branches: IBranchRepository,
    @inject(userRepositoryToken) private readonly users: IUserRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
  ) {}

  async execute(id: number, input: unknown) {
    const changes = updateBranchSchema.parse(input)

    // The counts and the write must see the same data, or two requests could each close "the other" branch.
    return this.unitOfWork.run(async () => {
      const existing = await this.branches.findByIdForUpdate(id)
      if (!existing) throw new DomainNotFoundError('ไม่พบสาขา', 'BRANCH_NOT_FOUND')

      // MAIN is the one branch every request works in; closing it would stop the shop.
      if (existing.code === 'MAIN' && changes.isActive === false)
        throw new DomainConflictError('ปิดสาขาหลักไม่ได้', 'MAIN_BRANCH_REQUIRED')

      if (existing.isActive && changes.isActive === false) {
        if ((await this.branches.countActive()) <= 1)
          throw new DomainConflictError('ต้องมีสาขาที่เปิดใช้งานอย่างน้อย 1 สาขา', 'BRANCH_IN_USE')
        if ((await this.users.countActiveInBranch(id)) > 0)
          throw new DomainConflictError('สาขานี้ยังมีผู้ใช้ที่ใช้งานอยู่ ย้ายผู้ใช้ไปสาขาอื่นก่อน', 'BRANCH_IN_USE')
      }

      return this.branches.update(existing.with(changes))
    })
  }
}
