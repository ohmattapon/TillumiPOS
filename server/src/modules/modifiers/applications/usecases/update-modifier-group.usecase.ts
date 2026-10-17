import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { modifierRepositoryToken } from '../ports/modifier.repository'
import type { IModifierRepository, ModifierGroupView } from '../ports/modifier.repository'
import { updateModifierGroupSchema } from '../schemas/modifier-schemas'

/** Command. */
@injectable()
export class UpdateModifierGroupUseCase {
  constructor(@inject(modifierRepositoryToken) private readonly modifiers: IModifierRepository) {}

  async execute(id: number, input: unknown): Promise<ModifierGroupView> {
    const changes = updateModifierGroupSchema.parse(input)

    const existing = await this.modifiers.findGroupById(id)
    if (!existing) throw new DomainNotFoundError('ไม่พบกลุ่มตัวเลือก', 'MODIFIER_GROUP_NOT_FOUND')

    await this.modifiers.updateGroup(existing.with(changes))
    return (await this.modifiers.findGroupView(id))!
  }
}
