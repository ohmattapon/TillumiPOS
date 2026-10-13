import { inject, injectable } from 'tsyringe'
import { saleCheckoutToken } from '../../../sales/applications/ports/sale-checkout.port'
import type { ISaleCheckout } from '../../../sales/applications/ports/sale-checkout.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { orderRepositoryToken } from '../ports/order.repository'
import type { IOrderRepository } from '../ports/order.repository'
import { payOrderSchema } from '../schemas/order-schemas'
import { inBranch, type OrderActor } from '../services/order-access'

/**
 * Command: pays an open order. It becomes a sale through the same checkout as a one-step sale
 * (at the prices the order quoted), and the order is closed pointing at that sale, all or nothing.
 */
@injectable()
export class PayOrderUseCase {
  constructor(
    @inject(orderRepositoryToken) private readonly orders: IOrderRepository,
    @inject(saleCheckoutToken) private readonly checkout: ISaleCheckout,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
  ) {}

  async execute(id: number, input: unknown, actor: OrderActor) {
    const dto = payOrderSchema.parse(input)

    // Locked first, so two tills paying the same order cannot both make a sale from it.
    return this.unitOfWork.run(async () => {
      const order = inBranch(await this.orders.findByIdForUpdate(id), actor.branch.id)
      order.assertPayable()

      const sale = await this.checkout.checkout({
        lines: order.items.map(({ productId, quantity, unitPriceSatang }) => ({ productId, quantity, unitPriceSatang })),
        discountSatang: dto.discountSatang ?? 0,
        payments: dto.payments,
        cashier: actor.user,
        branch: actor.branch,
      })
      await this.orders.save(order.markPaid(sale.id))
      return sale
    })
  }
}
