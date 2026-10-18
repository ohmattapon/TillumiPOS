import { inject, injectable } from 'tsyringe'
import type { Page } from '../../../../domains/page'
import { ProductEntity, type ProductEntityProps } from '../../../../domains/product.domain'
import { cacheKey } from '../../../../libs/cache-key'
import { repositoryReadCacheToken, type IRepositoryReadCache } from '../../../shared/ports/repository-read-cache.port'
import type { IFindProductsQuery, IProductRepository } from '../../applications/ports/product.repository'
import { DrizzleProductRepository } from './product.drizzle.repository'

@injectable()
export class CachedProductRepository implements IProductRepository {
  constructor(
    @inject(DrizzleProductRepository) private readonly source: DrizzleProductRepository,
    @inject(repositoryReadCacheToken) private readonly cache: IRepositoryReadCache,
  ) {}

  findAll(query: IFindProductsQuery) {
    return this.cache.read('products', cacheKey(query), 30, () => this.source.findAll(query),
      (page) => ({ items: page.items.map((row) => row.toSnapshot()), total: page.total }),
      (value) => {
        const page = value as Page<ProductEntityProps>
        if (!Number.isInteger(page.total) || page.total < 0) throw new Error('Invalid cached total')
        return { items: page.items.map((row) => new ProductEntity(row)), total: page.total }
      })
  }
  findById(id: number, branchId: number) { return this.source.findById(id, branchId) }
  nextSkuNumber() { return this.source.nextSkuNumber() }
  skuExists(sku: string) { return this.source.skuExists(sku) }
  findManyForUpdate(ids: number[], branchId: number) { return this.source.findManyForUpdate(ids, branchId) }
  async create(entity: ProductEntity, branchId: number) {
    const saved = await this.source.create(entity, branchId)
    await this.cache.changed('products')
    return saved
  }
  async update(entity: ProductEntity, branchId: number) {
    const saved = await this.source.update(entity, branchId)
    await this.cache.changed('products')
    return saved
  }
  async adjustStock(id: number, branchId: number, delta: number) {
    const stock = await this.source.adjustStock(id, branchId, delta)
    await this.cache.changed('products')
    return stock
  }
  async setImageKey(id: number, imageKey: string | null, branchId: number) {
    const saved = await this.source.setImageKey(id, imageKey, branchId)
    await this.cache.changed('products')
    return saved
  }
}
