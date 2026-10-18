import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { ModifierOptionEntity } from '../../../../domains/modifier.domain'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { modifierRepositoryToken } from '../ports/modifier.repository'
import type { IModifierRepository } from '../ports/modifier.repository'
import { createModifierOptionSchema } from '../schemas/modifier-schemas'
import { GroupDefaults } from '../services/group-defaults'

/** Command. */
@injectable()
export class CreateModifierOptionUseCase {
  constructor(
    @inject(modifierRepositoryToken) private readonly modifiers: IModifierRepository,
    @inject(GroupDefaults) private readonly groupDefaults: GroupDefaults,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
  ) {}

  async execute(groupId: number, input: unknown) {
    const dto = createModifierOptionSchema.parse(input)

    if (!(await this.modifiers.findGroupById(groupId)))
      throw new DomainNotFoundError('ไม่พบกลุ่มตัวเลือก', 'MODIFIER_GROUP_NOT_FOUND')

    return this.unitOfWork.run(async () => {
      const created = await this.modifiers.createOption(
        new ModifierOptionEntity({
          id: 0,
          groupId,
          name: dto.name,
          priceSatang: dto.priceSatang ?? 0,
          costSatang: dto.costSatang ?? 0,
          sortOrder: dto.sortOrder ?? 0,
          isActive: true,
          isDefault: dto.isDefault ?? false,
        }),
      )
      await this.groupDefaults.keepOnly(created)
      return created
    })
  }
}
