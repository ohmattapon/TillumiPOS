import { inject, injectable } from 'tsyringe'
import {
  ModifierGroupEntity, ModifierOptionEntity, type ModifierGroupProps, type ModifierOptionProps,
} from '../../../../domains/modifier.domain'
import { repositoryReadCacheToken, type IRepositoryReadCache } from '../../../shared/ports/repository-read-cache.port'
import type { IModifierRepository } from '../../applications/ports/modifier.repository'
import { DrizzleModifierRepository } from './modifier.drizzle.repository'

interface GroupSnapshot { group: ModifierGroupProps; options: ModifierOptionProps[]; productIds: number[] }

@injectable()
export class CachedModifierRepository implements IModifierRepository {
  constructor(
    @inject(DrizzleModifierRepository) private readonly source: DrizzleModifierRepository,
    @inject(repositoryReadCacheToken) private readonly cache: IRepositoryReadCache,
  ) {}
  findAllGroups() {
    return this.cache.read('modifiers', 'all', 30, () => this.source.findAllGroups(),
      (rows) => rows.map((row) => ({ group: row.group.toSnapshot(), options: row.options.map((option) => option.toSnapshot()), productIds: row.productIds })),
      (value) => (value as GroupSnapshot[]).map((row) => {
        if (!Array.isArray(row.productIds) || !row.productIds.every(Number.isInteger)) throw new Error('Invalid cached product ids')
        return { group: new ModifierGroupEntity(row.group), options: row.options.map((option) => new ModifierOptionEntity(option)), productIds: row.productIds }
      }))
  }
  findGroupView(id: number) { return this.source.findGroupView(id) }
  findGroupById(id: number) { return this.source.findGroupById(id) }
  findGroupsByIds(ids: number[]) { return this.source.findGroupsByIds(ids) }
  findOptionById(id: number) { return this.source.findOptionById(id) }
  findGroupsForProduct(productId: number) { return this.source.findGroupsForProduct(productId) }
  async createGroup(entity: ModifierGroupEntity) {
    const saved = await this.source.createGroup(entity)
    await this.cache.changed('modifiers')
    return saved
  }
  async updateGroup(entity: ModifierGroupEntity) {
    const saved = await this.source.updateGroup(entity)
    await this.cache.changed('modifiers')
    return saved
  }
  async createOption(entity: ModifierOptionEntity) {
    const saved = await this.source.createOption(entity)
    await this.cache.changed('modifiers')
    return saved
  }
  async updateOption(entity: ModifierOptionEntity) {
    const saved = await this.source.updateOption(entity)
    await this.cache.changed('modifiers')
    return saved
  }
  async setProductGroups(productId: number, groupIds: number[]) {
    await this.source.setProductGroups(productId, groupIds)
    await this.cache.changed('modifiers')
  }
}
