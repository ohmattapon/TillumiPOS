import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { ModifierOptionEntity } from '../../../../domains/modifier.domain'
import { modifierRepositoryToken } from '../ports/modifier.repository'
import type { IModifierRepository } from '../ports/modifier.repository'
import { createModifierOptionSchema } from '../schemas/modifier-schemas'

/** Command. */
@injectable()
export class CreateModifierOptionUseCase {
  constructor(@inject(modifierRepositoryToken) private readonly modifiers: IModifierRepository) {}

  async execute(groupId: number, input: unknown) {
    const dto = createModifierOptionSchema.parse(input)

    if (!(await this.modifiers.findGroupById(groupId)))
      throw new DomainNotFoundError('ไม่พบกลุ่มตัวเลือก', 'MODIFIER_GROUP_NOT_FOUND')

    return this.modifiers.createOption(
      new ModifierOptionEntity({
        id: 0,
        groupId,
        name: dto.name,
        priceSatang: dto.priceSatang ?? 0,
        costSatang: dto.costSatang ?? 0,
        sortOrder: dto.sortOrder ?? 0,
        isActive: true,
      }),
    )
  }
}
