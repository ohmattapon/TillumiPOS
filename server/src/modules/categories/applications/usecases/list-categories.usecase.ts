import { inject, injectable } from 'tsyringe'
import { categoryRepositoryToken } from '../ports/category.repository'
import type { ICategoryRepository } from '../ports/category.repository'

/** Query. */
@injectable()
export class ListCategoriesUseCase {
  constructor(@inject(categoryRepositoryToken) private readonly categories: ICategoryRepository) {}

  execute() {
    return this.categories.findAll()
  }
}
