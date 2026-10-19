import { inject, injectable } from 'tsyringe'
import { starterOptionGroupsFor } from '../../../domains/cafe-menu.domain'
import { ModifierGroupEntity, ModifierOptionEntity } from '../../../domains/modifier.domain'
import type { ShopType } from '../../../domains/shop-settings.domain'
import type { IStarterOptionGroups } from '../../setup/applications/ports/starter-option-groups.port'
import { modifierRepositoryToken } from '../applications/ports/modifier.repository'
import type { IModifierRepository } from '../applications/ports/modifier.repository'

/** The setup's port, answered here because the groups are this module's: stores what the catalogue says a new shop starts with. */
@injectable()
export class ModifierStarterOptionGroups implements IStarterOptionGroups {
  constructor(@inject(modifierRepositoryToken) private readonly modifiers: IModifierRepository) {}

  async addFor(shopType: ShopType): Promise<void> {
    const existing = await this.modifiers.findAllGroups()
    const groups = starterOptionGroupsFor(shopType, existing.map((view) => view.group.name))

    for (const group of groups) {
      const created = await this.modifiers.createGroup(
        new ModifierGroupEntity({
          id: 0,
          name: group.name,
          required: group.required,
          maxSelections: group.maxSelections,
          sortOrder: group.sortOrder,
          isActive: true,
        }),
      )
      for (const option of group.options)
        await this.modifiers.createOption(
          new ModifierOptionEntity({
            id: 0,
            groupId: created.id,
            name: option.name,
            priceSatang: option.priceSatang,
            costSatang: option.costSatang,
            sortOrder: option.sortOrder,
            isActive: true,
            isDefault: option.isDefault,
          }),
        )
    }
  }
}
