import { inject, injectable } from 'tsyringe'
import type { ModifierOptionEntity } from '../../../../domains/modifier.domain'
import { modifierRepositoryToken } from '../ports/modifier.repository'
import type { IModifierRepository } from '../ports/modifier.repository'

/**
 * At most one option of a group is the default. The rule lives here because two commands can break
 * it (creating an option and updating one), and it is a business rule, so it belongs in the core.
 */
@injectable()
export class GroupDefaults {
  constructor(@inject(modifierRepositoryToken) private readonly modifiers: IModifierRepository) {}

  /** Takes the flag away from the group's other options, so `option` is the only default. */
  async keepOnly(option: ModifierOptionEntity): Promise<void> {
    if (!option.isDefault) return

    const view = await this.modifiers.findGroupView(option.groupId)
    if (!view) return
    for (const other of view.options)
      if (other.id !== option.id && other.isDefault) await this.modifiers.updateOption(other.with({ isDefault: false }))
  }
}
