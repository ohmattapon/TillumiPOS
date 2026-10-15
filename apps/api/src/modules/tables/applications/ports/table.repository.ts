import type { DiningTableEntity } from '../../../../domains/dining-table.domain'

export interface ITableRepository {
  /** Every table of the branch, active or not, ordered by sort order then name. */
  findAll(branchId: number): Promise<DiningTableEntity[]>
  findById(id: number): Promise<DiningTableEntity | null>
  /** Throws DomainConflictError DUPLICATE for a name already used in the branch. */
  create(entity: DiningTableEntity): Promise<DiningTableEntity>
  update(entity: DiningTableEntity): Promise<DiningTableEntity>
}

const tableRepositoryTokenSymbol: unique symbol = Symbol('ITableRepository')
export const tableRepositoryToken = tableRepositoryTokenSymbol.toString()
