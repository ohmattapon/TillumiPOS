import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { modifierRepositoryToken } from '../ports/modifier.repository'
import type { IModifierRepository } from '../ports/modifier.repository'
import { updateModifierOptionSchema } from '../schemas/modifier-schemas'

/** Command. */
@injectable()
export class UpdateModifierOptionUseCase {
  constructor(@inject(modifierRepositoryToken) private readonly modifiers: IModifierRepository) {}

  async execute(id: number, input: unknown) {
    const changes = updateModifierOptionSchema.parse(input)

    const existing = await this.modifiers.findOptionById(id)
    if (!existing) throw new DomainNotFoundError('ไม่พบตัวเลือก', 'MODIFIER_OPTION_NOT_FOUND')

    return this.modifiers.updateOption(existing.with(changes))
  }
}
