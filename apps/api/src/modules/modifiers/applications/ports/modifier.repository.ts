import type {
  ModifierGroupEntity,
  ModifierGroupWithOptions,
  ModifierOptionEntity,
} from '../../../../domains/modifier.domain'

/** A group as the owner manages it: with its options and the products it is offered on. */
export interface ModifierGroupView {
  group: ModifierGroupEntity
  options: ModifierOptionEntity[]
  productIds: number[]
}

export interface IModifierRepository {
  /** Every group, active or not, ordered by sort order then name. */
  findAllGroups(): Promise<ModifierGroupView[]>
  findGroupView(id: number): Promise<ModifierGroupView | null>
  findGroupById(id: number): Promise<ModifierGroupEntity | null>
  findGroupsByIds(ids: number[]): Promise<ModifierGroupEntity[]>
  findOptionById(id: number): Promise<ModifierOptionEntity | null>
  /** The groups offered on a product with their options, in the order the product asks them. Inactive ones included. */
  findGroupsForProduct(productId: number): Promise<ModifierGroupWithOptions[]>
  /** Throws DomainConflictError DUPLICATE for a taken name. */
  createGroup(entity: ModifierGroupEntity): Promise<ModifierGroupEntity>
  updateGroup(entity: ModifierGroupEntity): Promise<ModifierGroupEntity>
  /** Throws DomainConflictError DUPLICATE for a name already in the group. */
  createOption(entity: ModifierOptionEntity): Promise<ModifierOptionEntity>
  updateOption(entity: ModifierOptionEntity): Promise<ModifierOptionEntity>
  /** Replaces the groups offered on a product; the order of the ids is the order they are asked in. */
  setProductGroups(productId: number, groupIds: number[]): Promise<void>
}

const modifierRepositoryTokenSymbol: unique symbol = Symbol('IModifierRepository')
export const modifierRepositoryToken = modifierRepositoryTokenSymbol.toString()
