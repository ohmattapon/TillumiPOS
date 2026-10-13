import type { CategoryEntity } from '../../../../domains/category.domain'

export interface ICategoryRepository {
  /** Every category, active or not, ordered by sort order then name. */
  findAll(): Promise<CategoryEntity[]>
  findById(id: number): Promise<CategoryEntity | null>
  /** Stores a new category and returns it with its assigned id. Throws DomainConflictError on a duplicate name. */
  create(entity: CategoryEntity): Promise<CategoryEntity>
  /** Overwrites the stored category that has the entity's id. Throws DomainConflictError on a duplicate name. */
  update(entity: CategoryEntity): Promise<CategoryEntity>
}

const categoryRepositoryTokenSymbol: unique symbol = Symbol('ICategoryRepository')
export const categoryRepositoryToken = categoryRepositoryTokenSymbol.toString()
