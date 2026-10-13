import { inject, injectable } from 'tsyringe'
import { CategoryEntity } from '../../../../domains/category.domain'
import { categoryRepositoryToken } from '../ports/category.repository'
import type { ICategoryRepository } from '../ports/category.repository'
import { createCategorySchema } from '../schemas/category-schemas'

/** Command. */
@injectable()
export class CreateCategoryUseCase {
  constructor(@inject(categoryRepositoryToken) private readonly categories: ICategoryRepository) {}

  async execute(input: unknown) {
    const dto = createCategorySchema.parse(input)

    return this.categories.create(
      new CategoryEntity({ id: 0, name: dto.name, sortOrder: dto.sortOrder ?? 0, isActive: true }),
    )
  }
}
