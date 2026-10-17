import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { modifierRepositoryToken } from '../ports/modifier.repository'
import type { IModifierRepository } from '../ports/modifier.repository'
import { updateModifierOptionSchema } from '../schemas/modifier-schemas'
import { GroupDefaults } from '../services/group-defaults'

/** Command. */
@injectable()
export class UpdateModifierOptionUseCase {
  constructor(
    @inject(modifierRepositoryToken) private readonly modifiers: IModifierRepository,
    @inject(GroupDefaults) private readonly groupDefaults: GroupDefaults,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
  ) {}

  async execute(id: number, input: unknown) {
    const changes = updateModifierOptionSchema.parse(input)

    const existing = await this.modifiers.findOptionById(id)
    if (!existing) throw new DomainNotFoundError('ไม่พบตัวเลือก', 'MODIFIER_OPTION_NOT_FOUND')

    return this.unitOfWork.run(async () => {
      const saved = await this.modifiers.updateOption(existing.with(changes))
      await this.groupDefaults.keepOnly(saved)
      return saved
    })
  }
}
