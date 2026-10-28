import { eq, inArray } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import {
  ModifierGroupEntity,
  ModifierOptionEntity,
  type ModifierGroupProps,
  type ModifierGroupWithOptions,
} from '../../../../domains/modifier.domain'
import {
  modifierGroups,
  modifierOptions,
  productModifierGroups,
} from '../../../../infrastructure/database/schema/modifiers'
import { isUniqueViolation } from '../../../../libs/pg-error'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IModifierRepository, ModifierGroupView } from '../../applications/ports/modifier.repository'

const groupColumns = {
  id: modifierGroups.id,
  name: modifierGroups.name,
  required: modifierGroups.required,
  maxSelections: modifierGroups.maxSelections,
  sortOrder: modifierGroups.sortOrder,
  isActive: modifierGroups.isActive,
}

const optionColumns = {
  id: modifierOptions.id,
  groupId: modifierOptions.groupId,
  name: modifierOptions.name,
  priceSatang: modifierOptions.priceSatang,
  costSatang: modifierOptions.costSatang,
  sortOrder: modifierOptions.sortOrder,
  isActive: modifierOptions.isActive,
  isDefault: modifierOptions.isDefault,
}

// Same code and message the API answers for a duplicate value elsewhere.
const duplicate = () => new DomainConflictError('ข้อมูลซ้ำกับที่มีอยู่แล้ว', 'DUPLICATE')

@injectable()
export class DrizzleModifierRepository implements IModifierRepository {
  async findAllGroups() {
    const rows = await currentExecutor()
      .select(groupColumns)
      .from(modifierGroups)
      .orderBy(modifierGroups.sortOrder, modifierGroups.name)
    return this.withMembers(rows)
  }

  async findGroupView(id: number) {
    const rows = await currentExecutor().select(groupColumns).from(modifierGroups).where(eq(modifierGroups.id, id))
    return (await this.withMembers(rows))[0] ?? null
  }

  async findGroupById(id: number) {
    const [row] = await currentExecutor().select(groupColumns).from(modifierGroups).where(eq(modifierGroups.id, id))
    return row ? new ModifierGroupEntity(row) : null
  }

  async findGroupsByIds(ids: number[]) {
    if (ids.length === 0) return []
    const rows = await currentExecutor().select(groupColumns).from(modifierGroups).where(inArray(modifierGroups.id, ids))
    return rows.map((row) => new ModifierGroupEntity(row))
  }

  async findOptionById(id: number) {
    const [row] = await currentExecutor().select(optionColumns).from(modifierOptions).where(eq(modifierOptions.id, id))
    return row ? new ModifierOptionEntity(row) : null
  }

  async findGroupsForProduct(productId: number): Promise<ModifierGroupWithOptions[]> {
    const executor = currentExecutor()
    const rows = await executor
      .select(groupColumns)
      .from(productModifierGroups)
      .innerJoin(modifierGroups, eq(productModifierGroups.groupId, modifierGroups.id))
      .where(eq(productModifierGroups.productId, productId))
      .orderBy(productModifierGroups.sortOrder, modifierGroups.sortOrder, modifierGroups.name)
    if (rows.length === 0) return []

    const options = await executor
      .select(optionColumns)
      .from(modifierOptions)
      .where(
        inArray(
          modifierOptions.groupId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(modifierOptions.sortOrder, modifierOptions.name)

    return rows.map((row) => ({
      group: new ModifierGroupEntity(row),
      options: options.filter((option) => option.groupId === row.id).map((option) => new ModifierOptionEntity(option)),
    }))
  }

  async createGroup(entity: ModifierGroupEntity) {
    const { id: _unassigned, ...values } = entity.toSnapshot()
    try {
      const [row] = await currentExecutor().insert(modifierGroups).values(values).returning(groupColumns)
      return new ModifierGroupEntity(row!)
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate()
      throw error
    }
  }

  async updateGroup(entity: ModifierGroupEntity) {
    const { id, ...values } = entity.toSnapshot()
    try {
      const [row] = await currentExecutor()
        .update(modifierGroups)
        .set(values)
        .where(eq(modifierGroups.id, id))
        .returning(groupColumns)
      // Only reachable if the row vanished between the use case's read and this write.
      if (!row) throw new DomainNotFoundError('ไม่พบกลุ่มตัวเลือก', 'MODIFIER_GROUP_NOT_FOUND')
      return new ModifierGroupEntity(row)
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate()
      throw error
    }
  }

  async createOption(entity: ModifierOptionEntity) {
    const { id: _unassigned, ...values } = entity.toSnapshot()
    try {
      const [row] = await currentExecutor().insert(modifierOptions).values(values).returning(optionColumns)
      return new ModifierOptionEntity(row!)
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate()
      throw error
    }
  }

  async updateOption(entity: ModifierOptionEntity) {
    const { id, groupId: _fixed, ...values } = entity.toSnapshot()
    try {
      const [row] = await currentExecutor()
        .update(modifierOptions)
        .set(values)
        .where(eq(modifierOptions.id, id))
        .returning(optionColumns)
      if (!row) throw new DomainNotFoundError('ไม่พบตัวเลือก', 'MODIFIER_OPTION_NOT_FOUND')
      return new ModifierOptionEntity(row)
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate()
      throw error
    }
  }

  async setProductGroups(productId: number, groupIds: number[]) {
    const executor = currentExecutor()
    await executor.delete(productModifierGroups).where(eq(productModifierGroups.productId, productId))
    if (groupIds.length > 0)
      await executor
        .insert(productModifierGroups)
        .values(groupIds.map((groupId, index) => ({ productId, groupId, sortOrder: index })))
  }

  /** Attaches each group's options and the products it is offered on. */
  private async withMembers(rows: ModifierGroupProps[]): Promise<ModifierGroupView[]> {
    if (rows.length === 0) return []
    const executor = currentExecutor()
    const ids = rows.map((row) => row.id)

    const options = await executor
      .select(optionColumns)
      .from(modifierOptions)
      .where(inArray(modifierOptions.groupId, ids))
      .orderBy(modifierOptions.sortOrder, modifierOptions.name)
    const bound = await executor
      .select({ groupId: productModifierGroups.groupId, productId: productModifierGroups.productId })
      .from(productModifierGroups)
      .where(inArray(productModifierGroups.groupId, ids))
      .orderBy(productModifierGroups.productId)

    return rows.map((row) => ({
      group: new ModifierGroupEntity(row),
      options: options.filter((option) => option.groupId === row.id).map((option) => new ModifierOptionEntity(option)),
      productIds: bound.filter((link) => link.groupId === row.id).map((link) => link.productId),
    }))
  }
}
