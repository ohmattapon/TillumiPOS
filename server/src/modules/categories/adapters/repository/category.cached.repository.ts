import { inject, injectable } from 'tsyringe'
import { CategoryEntity, type CategoryEntityProps } from '../../../../domains/category.domain'
import { repositoryReadCacheToken, type IRepositoryReadCache } from '../../../shared/ports/repository-read-cache.port'
import type { ICategoryRepository } from '../../applications/ports/category.repository'
import { DrizzleCategoryRepository } from './category.drizzle.repository'

@injectable()
export class CachedCategoryRepository implements ICategoryRepository {
  constructor(
    @inject(DrizzleCategoryRepository) private readonly source: DrizzleCategoryRepository,
    @inject(repositoryReadCacheToken) private readonly cache: IRepositoryReadCache,
  ) {}

  findAll() {
    return this.cache.read('categories', 'all', 60, () => this.source.findAll(),
      (rows) => rows.map((row) => row.toSnapshot()),
      (value) => (value as CategoryEntityProps[]).map((row) => new CategoryEntity(row)))
  }
  findById(id: number) { return this.source.findById(id) }
  async create(entity: CategoryEntity) {
    const saved = await this.source.create(entity)
    await this.cache.changed('categories')
    return saved
  }
  async update(entity: CategoryEntity) {
    const saved = await this.source.update(entity)
    await this.cache.changed('categories')
    return saved
  }
}
