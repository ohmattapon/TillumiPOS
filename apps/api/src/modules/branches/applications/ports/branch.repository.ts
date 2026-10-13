import type { BranchEntity } from '../../../../domains/branch.domain'

export interface IBranchRepository {
  /** Every branch, active or not, ordered by code. */
  findAll(): Promise<BranchEntity[]>
  findById(id: number): Promise<BranchEntity | null>
  /** Like findById, but row-locks the branch until the surrounding unit of work ends. */
  findByIdForUpdate(id: number): Promise<BranchEntity | null>
  /** Throws DomainConflictError: BRANCH_CODE_TAKEN when the code is in use. */
  create(entity: BranchEntity): Promise<BranchEntity>
  update(entity: BranchEntity): Promise<BranchEntity>
  countActive(): Promise<number>
}

const branchRepositoryTokenSymbol: unique symbol = Symbol('IBranchRepository')
export const branchRepositoryToken = branchRepositoryTokenSymbol.toString()
