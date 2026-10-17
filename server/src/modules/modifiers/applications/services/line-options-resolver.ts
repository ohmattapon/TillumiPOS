import { inject, injectable } from 'tsyringe'
import { resolveLineOptions } from '../../../../domains/modifier.domain'
import type { ILineOptionsResolver } from '../ports/line-options-resolver.port'
import { modifierRepositoryToken } from '../ports/modifier.repository'
import type { IModifierRepository } from '../ports/modifier.repository'

@injectable()
export class LineOptionsResolver implements ILineOptionsResolver {
  constructor(@inject(modifierRepositoryToken) private readonly modifiers: IModifierRepository) {}

  async resolve(productId: number, optionIds: readonly number[]) {
    return resolveLineOptions(await this.modifiers.findGroupsForProduct(productId), optionIds)
  }
}
