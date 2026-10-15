import { inject, injectable } from 'tsyringe'
import { lineKey } from '../../../../domains/modifier.domain'
import type { OrderedProduct } from '../../../../domains/order.domain'
import { lineOptionsResolverToken } from '../../../modifiers/applications/ports/line-options-resolver.port'
import type { ILineOptionsResolver } from '../../../modifiers/applications/ports/line-options-resolver.port'
import { productRepositoryToken } from '../../../products/applications/ports/product.repository'
import type { IProductRepository } from '../../../products/applications/ports/product.repository'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { orderRepositoryToken } from '../ports/order.repository'
import type { IOrderRepository } from '../ports/order.repository'
import { addOrderItemSchema } from '../schemas/order-schemas'
import { inBranch } from '../services/order-access'
import { findOrderedProduct } from '../services/ordered-product'

/**
 * Command: puts a product, with the options chosen, on an open order. The same product with the same
 * options adds to its line, which keeps the price it was quoted.
 */
@injectable()
export class AddOrderItemUseCase {
  constructor(
    @inject(orderRepositoryToken) private readonly orders: IOrderRepository,
    @inject(productRepositoryToken) private readonly products: IProductRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(lineOptionsResolverToken) private readonly lineOptions: ILineOptionsResolver,
  ) {}

  async execute(id: number, input: unknown, branchId: number) {
    const dto = addOrderItemSchema.parse(input)

    return this.unitOfWork.run(async () => {
      const order = inBranch(await this.orders.findByIdForUpdate(id), branchId)
      const chosen = await this.lineOptions.resolve(dto.productId, dto.options ?? [])
      // A line that is already there keeps the price it was quoted; only a new one is looked up.
      const existing = order.items.find(
        (item) => item.productId === dto.productId && lineKey(item.options) === chosen.key,
      )
      let product: OrderedProduct
      if (existing) product = existing
      else {
        const found = await findOrderedProduct(this.products, dto.productId, branchId)
        product = { ...found, unitPriceSatang: found.unitPriceSatang + chosen.priceSatang }
      }
      return this.orders.save(order.addItem(product, dto.quantity, chosen.options))
    })
  }
}
