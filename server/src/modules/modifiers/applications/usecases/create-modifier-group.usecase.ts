import { inject, injectable } from 'tsyringe'
import { ModifierGroupEntity } from '../../../../domains/modifier.domain'
import { modifierRepositoryToken } from '../ports/modifier.repository'
import type { IModifierRepository, ModifierGroupView } from '../ports/modifier.repository'
import { createModifierGroupSchema } from '../schemas/modifier-schemas'

/** Command. */
@injectable()
export class CreateModifierGroupUseCase {
  constructor(@inject(modifierRepositoryToken) private readonly modifiers: IModifierRepository) {}

  async execute(input: unknown): Promise<ModifierGroupView> {
    const dto = createModifierGroupSchema.parse(input)

    const group = await this.modifiers.createGroup(
      new ModifierGroupEntity({
        id: 0,
        name: dto.name,
        required: dto.required ?? false,
        maxSelections: dto.maxSelections ?? 1,
        sortOrder: dto.sortOrder ?? 0,
        isActive: true,
      }),
    )
    return { group, options: [], productIds: [] }
  }
}
