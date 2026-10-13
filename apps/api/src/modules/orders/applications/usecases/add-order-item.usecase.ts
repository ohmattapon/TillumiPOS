import type { IOrderRepository } from '../ports/order.repository'
import type { IProductRepository } from '../../../products/applications/ports/product.repository'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { addOrderItemSchema } from '../schemas/order-schemas'
import { findOrderedProduct } from '../services/ordered-product'
import { inBranch } from '../services/order-access'
import { inject, injectable } from 'tsyringe'
import { orderRepositoryToken } from '../ports/order.repository'
import { productRepositoryToken } from '../../../products/applications/ports/product.repository'

/** Command: puts a product on an open order, adding to its line if it is already there. */
@injectable()
export class AddOrderItemUseCase {
  constructor(
    @inject(orderRepositoryToken) private readonly orders: IOrderRepository,
    @inject(productRepositoryToken) private readonly products: IProductRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
  ) {}

  async execute(id: number, input: unknown, branchId: number) {
    const dto = addOrderItemSchema.parse(input)

    return this.unitOfWork.run(async () => {
      const order = inBranch(await this.orders.findByIdForUpdate(id), branchId)
      // A line that is already there keeps the price it was quoted; only a new one is looked up.
      const existing = order.items.find((item) => item.productId === dto.productId)
      const product = existing ?? (await findOrderedProduct(this.products, dto.productId, branchId))
      return this.orders.save(order.addItem(product, dto.quantity))
    })
  }
}
