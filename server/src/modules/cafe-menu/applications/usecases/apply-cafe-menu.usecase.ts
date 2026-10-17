import { inject, injectable } from 'tsyringe'
import { requirePermission, type Actor } from '../../../../domains/authorization'
import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { planCafeMenu, sameCafeMenuName } from '../../../../domains/cafe-menu.domain'
import { CategoryEntity } from '../../../../domains/category.domain'
import { DomainError } from '../../../../domains/errors/domain-error'
import { ModifierGroupEntity, ModifierOptionEntity } from '../../../../domains/modifier.domain'
import { ProductEntity } from '../../../../domains/product.domain'
import { auditLogToken, type IAuditLog } from '../../../audit/applications/ports/audit-log.port'
import { categoryRepositoryToken } from '../../../categories/applications/ports/category.repository'
import type { ICategoryRepository } from '../../../categories/applications/ports/category.repository'
import { modifierRepositoryToken } from '../../../modifiers/applications/ports/modifier.repository'
import type { IModifierRepository } from '../../../modifiers/applications/ports/modifier.repository'
import { productRepositoryToken } from '../../../products/applications/ports/product.repository'
import type { IProductRepository } from '../../../products/applications/ports/product.repository'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { applyCafeMenuSchema } from '../schemas/cafe-menu-schemas'

/** How many products are read to spot what the shop already has; the products list caps a page at this. */
const PRODUCTS_READ_LIMIT = 1000

export interface AppliedCafeMenu {
  added: { categories: number; products: number; groups: number; options: number }
  reused: { categories: number; groups: number }
  skipped: { products: number; items: { key: string; name: string }[] }
}

/**
 * Command: adds the drinks of the starter set that the owner ticked, and nothing else. Everything a
 * shop already has is reused (categories and groups by name) or skipped (products by SKU and name),
 * never overwritten, and the whole run is one transaction with one audit entry.
 */
@injectable()
export class ApplyCafeMenuUseCase {
  constructor(
    @inject(categoryRepositoryToken) private readonly categories: ICategoryRepository,
    @inject(productRepositoryToken) private readonly products: IProductRepository,
    @inject(modifierRepositoryToken) private readonly modifiers: IModifierRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(auditLogToken) private readonly audit: IAuditLog,
  ) {}

  async execute(input: unknown, actor: Actor & { id: number; displayName: string }, branchId: number): Promise<AppliedCafeMenu> {
    const dto = applyCafeMenuSchema.parse(input)

    // The route already guards products.write (a route can carry one permission only); the other two
    // are business rules, so they are checked here, before anything is read or written.
    requirePermission(actor, 'products.write')
    requirePermission(actor, 'categories.write')
    requirePermission(actor, 'modifiers.write')

    return this.unitOfWork.run(async () => {
      const existingCategories = await this.categories.findAll()
      const existingGroups = await this.modifiers.findAllGroups()
      const existingProducts = await this.products.findAll({ branchId, includeInactive: true, limit: PRODUCTS_READ_LIMIT })

      const plan = planCafeMenu(dto.itemKeys, {
        categoryNames: existingCategories.map((category) => category.name),
        groupNames: existingGroups.map((view) => view.group.name),
        products: existingProducts.items.map((product) => ({ sku: product.sku, name: product.name })),
      })

      const unknown = plan.unknown[0]
      if (unknown)
        throw new DomainError(`ไม่มีเมนู "${unknown}" อยู่ในชุดเมนูคาเฟ่`, 'INVALID_CAFE_MENU_ITEM', { key: unknown })

      const categoryIds = new Map<string, number>()
      for (const category of plan.toCreate.categories) {
        const created = await this.categories.create(
          new CategoryEntity({ id: 0, name: category.name, sortOrder: category.sortOrder, isActive: true }),
        )
        categoryIds.set(category.key, created.id)
      }
      for (const category of plan.toReuse.categories) {
        const found = existingCategories.find((row) => sameCafeMenuName(row.name, category.name))
        if (found) categoryIds.set(category.key, found.id)
      }

      const groupIds = new Map<string, number>()
      let optionsAdded = 0
      for (const group of plan.toCreate.groups) {
        const createdGroup = await this.modifiers.createGroup(
          new ModifierGroupEntity({
            id: 0,
            name: group.name,
            required: group.required,
            maxSelections: group.maxSelections,
            sortOrder: group.sortOrder,
            isActive: true,
          }),
        )
        for (const option of group.options) {
          await this.modifiers.createOption(
            new ModifierOptionEntity({
              id: 0,
              groupId: createdGroup.id,
              name: option.name,
              priceSatang: option.priceSatang,
              costSatang: option.costSatang,
              sortOrder: option.sortOrder,
              isActive: true,
              isDefault: option.isDefault,
            }),
          )
          optionsAdded += 1
        }
        groupIds.set(group.key, createdGroup.id)
      }
      for (const group of plan.toReuse.groups) {
        const found = existingGroups.find((view) => sameCafeMenuName(view.group.name, group.name))
        if (found) groupIds.set(group.key, found.group.id)
      }

      for (const item of plan.toCreate.items) {
        const created = await this.products.create(
          new ProductEntity({
            id: 0,
            sku: item.key,
            barcode: null,
            name: item.name,
            // A category of a created item was either just created or found above.
            categoryId: categoryIds.get(item.categoryKey) ?? null,
            priceSatang: item.priceSatang,
            costSatang: 0,
            // Counting starts off for the whole set: drinks are made to order, so nothing is greyed out.
            trackStock: false,
            stockQty: 0,
            isActive: true,
            imageKey: null,
          }),
          branchId,
        )
        const ids = item.optionGroupKeys
          .map((key) => groupIds.get(key))
          .filter((id): id is number => id !== undefined)
        // Replaces the whole set, so it is only ever called for a product this run created.
        if (ids.length > 0) await this.modifiers.setProductGroups(created.id, ids)
      }

      const applied: AppliedCafeMenu = {
        added: {
          categories: plan.toCreate.categories.length,
          products: plan.toCreate.items.length,
          groups: plan.toCreate.groups.length,
          options: optionsAdded,
        },
        reused: { categories: plan.toReuse.categories.length, groups: plan.toReuse.groups.length },
        skipped: {
          products: plan.toSkip.length,
          items: plan.toSkip.map((item) => ({ key: item.key, name: item.name })),
        },
      }

      await this.audit.record(
        { id: actor.id, name: actor.displayName },
        branchId,
        buildAuditEntry({
          action: 'cafe_menu.applied',
          entityType: 'cafe_menu',
          entityId: 'shop',
          summary: `เพิ่มเมนูคาเฟ่ ${applied.added.products} รายการ ข้าม ${applied.skipped.products} รายการ`,
          after: {
            addedProducts: plan.toCreate.items.map((item) => item.key),
            addedCategories: plan.toCreate.categories.map((category) => category.name),
            addedGroups: plan.toCreate.groups.map((group) => group.name),
            reusedCategories: plan.toReuse.categories.map((category) => category.name),
            reusedGroups: plan.toReuse.groups.map((group) => group.name),
            skippedProducts: plan.toSkip.map((item) => item.key),
          },
        }),
      )

      return applied
    })
  }
}
