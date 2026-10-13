import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { categoryRepositoryToken } from '../ports/category.repository'
import type { ICategoryRepository } from '../ports/category.repository'
import { updateCategorySchema } from '../schemas/category-schemas'

/** Command. */
@injectable()
export class UpdateCategoryUseCase {
  constructor(@inject(categoryRepositoryToken) private readonly categories: ICategoryRepository) {}

  async execute(id: number, input: unknown) {
    const changes = updateCategorySchema.parse(input)

    const existing = await this.categories.findById(id)
    if (!existing) throw new DomainNotFoundError('ไม่พบหมวดหมู่')

    return this.categories.update(existing.with(changes))
  }
}
