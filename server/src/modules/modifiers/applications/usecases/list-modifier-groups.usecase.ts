import { inject, injectable } from 'tsyringe'
import { modifierRepositoryToken } from '../ports/modifier.repository'
import type { IModifierRepository } from '../ports/modifier.repository'

/** Query. */
@injectable()
export class ListModifierGroupsUseCase {
  constructor(@inject(modifierRepositoryToken) private readonly modifiers: IModifierRepository) {}

  execute() {
    return this.modifiers.findAllGroups()
  }
}
