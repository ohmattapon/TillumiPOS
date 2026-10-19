import { injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import {
  ModifierGroupEntity,
  ModifierOptionEntity,
  type ModifierGroupProps,
  type ModifierGroupWithOptions,
  type ModifierOptionProps,
} from '../../../../domains/modifier.domain'
import type { IModifierRepository, ModifierGroupView } from '../../applications/ports/modifier.repository'

// Same code and message the API answers for a duplicate value elsewhere.
const duplicate = () => new DomainConflictError('ข้อมูลซ้ำกับที่มีอยู่แล้ว', 'DUPLICATE')

const byGroupOrder = (a: ModifierGroupProps, b: ModifierGroupProps) =>
  a.sortOrder - b.sortOrder || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

const byOptionOrder = (a: ModifierOptionProps, b: ModifierOptionProps) =>
  a.sortOrder - b.sortOrder || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

/** No-database modifier store: Maps for groups, options and product links, ids from 1. */
@injectable()
export class MemoryModifierRepository implements IModifierRepository {
  private readonly groups = new Map<number, ModifierGroupProps>()
  private readonly options = new Map<number, ModifierOptionProps>()
  // The order of each product's group ids is the order they are asked in.
  private readonly productGroups = new Map<number, number[]>()
  private nextGroupId = 1
  private nextOptionId = 1

  async findAllGroups() {
    return this.withMembers([...this.groups.values()].sort(byGroupOrder))
  }

  async findGroupView(id: number) {
    const row = this.groups.get(id)
    return row ? this.withMembers([row])[0]! : null
  }

  async findGroupById(id: number) {
    const row = this.groups.get(id)
    return row ? new ModifierGroupEntity(row) : null
  }

  async findGroupsByIds(ids: number[]) {
    if (ids.length === 0) return []
    const wanted = new Set(ids)
    return [...this.groups.values()]
      .filter((row) => wanted.has(row.id))
      .map((row) => new ModifierGroupEntity(row))
  }

  async findOptionById(id: number) {
    const row = this.options.get(id)
    return row ? new ModifierOptionEntity(row) : null
  }

  async findGroupsForProduct(productId: number): Promise<ModifierGroupWithOptions[]> {
    const groupIds = this.productGroups.get(productId) ?? []
    const order = new Map(groupIds.map((id, index) => [id, index]))
    const rows = groupIds
      .map((id) => this.groups.get(id))
      .filter((row): row is ModifierGroupProps => row !== undefined)
      .sort((a, b) => order.get(a.id)! - order.get(b.id)! || byGroupOrder(a, b))
    if (rows.length === 0) return []
    return rows.map((row) => ({
      group: new ModifierGroupEntity(row),
      options: this.optionsOf(row.id),
    }))
  }

  async createGroup(entity: ModifierGroupEntity) {
    if ([...this.groups.values()].some((row) => row.name === entity.name)) throw duplicate()
    const stored: ModifierGroupProps = { ...entity.toSnapshot(), id: this.nextGroupId++ }
    this.groups.set(stored.id, stored)
    return new ModifierGroupEntity(stored)
  }

  async updateGroup(entity: ModifierGroupEntity) {
    const stored = this.groups.get(entity.id)
    // Only reachable if the row vanished between the use case's read and this write.
    if (!stored) throw new DomainNotFoundError('ไม่พบกลุ่มตัวเลือก', 'MODIFIER_GROUP_NOT_FOUND')
    if ([...this.groups.values()].some((row) => row.id !== entity.id && row.name === entity.name)) throw duplicate()
    const next: ModifierGroupProps = { ...entity.toSnapshot(), id: stored.id }
    this.groups.set(next.id, next)
    return new ModifierGroupEntity(next)
  }

  async createOption(entity: ModifierOptionEntity) {
    if (
      [...this.options.values()].some((row) => row.groupId === entity.groupId && row.name === entity.name)
    )
      throw duplicate()
    const stored: ModifierOptionProps = { ...entity.toSnapshot(), id: this.nextOptionId++ }
    this.options.set(stored.id, stored)
    return new ModifierOptionEntity(stored)
  }

  async updateOption(entity: ModifierOptionEntity) {
    const stored = this.options.get(entity.id)
    if (!stored) throw new DomainNotFoundError('ไม่พบตัวเลือก', 'MODIFIER_OPTION_NOT_FOUND')
    if (
      [...this.options.values()].some(
        (row) => row.id !== entity.id && row.groupId === stored.groupId && row.name === entity.name,
      )
    )
      throw duplicate()
    const next: ModifierOptionProps = { ...entity.toSnapshot(), id: stored.id, groupId: stored.groupId }
    this.options.set(next.id, next)
    return new ModifierOptionEntity(next)
  }

  async setProductGroups(productId: number, groupIds: number[]) {
    this.productGroups.set(productId, [...groupIds])
  }

  private optionsOf(groupId: number) {
    return [...this.options.values()]
      .filter((option) => option.groupId === groupId)
      .sort(byOptionOrder)
      .map((option) => new ModifierOptionEntity(option))
  }

  /** Attaches each group's options and the products it is offered on. */
  private withMembers(rows: ModifierGroupProps[]): ModifierGroupView[] {
    if (rows.length === 0) return []
    return rows.map((row) => ({
      group: new ModifierGroupEntity(row),
      options: this.optionsOf(row.id),
      productIds: [...this.productGroups.entries()]
        .filter(([, groupIds]) => groupIds.includes(row.id))
        .map(([productId]) => productId)
        .sort((a, b) => a - b),
    }))
  }
}
