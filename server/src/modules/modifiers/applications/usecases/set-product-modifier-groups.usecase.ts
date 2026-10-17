import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { productRepositoryToken } from '../../../products/applications/ports/product.repository'
import type { IProductRepository } from '../../../products/applications/ports/product.repository'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { modifierRepositoryToken } from '../ports/modifier.repository'
import type { IModifierRepository } from '../ports/modifier.repository'
import { setProductModifierGroupsSchema } from '../schemas/modifier-schemas'

/** Command: replaces the option groups offered on a product. The order given is the order they are asked in. */
@injectable()
export class SetProductModifierGroupsUseCase {
  constructor(
    @inject(modifierRepositoryToken) private readonly modifiers: IModifierRepository,
    @inject(productRepositoryToken) private readonly products: IProductRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
  ) {}

  async execute(productId: number, input: unknown, branchId: number): Promise<number[]> {
    const dto = setProductModifierGroupsSchema.parse(input)
    const groupIds = [...new Set(dto.groupIds)]

    return this.unitOfWork.run(async () => {
      if (!(await this.products.findById(productId, branchId)))
        throw new DomainNotFoundError('ไม่พบสินค้ารหัส ' + productId, 'PRODUCT_NOT_FOUND', { productId })
      const found = await this.modifiers.findGroupsByIds(groupIds)
      if (found.length !== groupIds.length)
        throw new DomainNotFoundError('ไม่พบกลุ่มตัวเลือกบางกลุ่ม', 'MODIFIER_GROUP_NOT_FOUND')

      await this.modifiers.setProductGroups(productId, groupIds)
      return groupIds
    })
  }
}
