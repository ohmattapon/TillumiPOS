import { inject, injectable } from 'tsyringe'
import type { OrderEntity } from '../../../../domains/order.domain'
import type { IOrderQuoteSource, QuotedOrder } from '../../../quotes/applications/ports/order-quote-source.port'
import { orderRepositoryToken, type IOrderRepository } from '../ports/order.repository'
import { inBranch } from './order-access'

/** Answers the quotes module: the lines an open order holds, at the prices it quoted. */
@injectable()
export class OrderQuoteSource implements IOrderQuoteSource {
  constructor(@inject(orderRepositoryToken) private readonly orders: IOrderRepository) {}

  async read(orderId: number, branchId: number) {
    return this.toQuoted(inBranch(await this.orders.findById(orderId), branchId))
  }

  async lockOpenOrder(orderId: number, branchId: number) {
    return this.toQuoted(inBranch(await this.orders.findByIdForUpdate(orderId), branchId))
  }

  private toQuoted(order: OrderEntity): QuotedOrder {
    order.assertOpen()
    return {
      id: order.id,
      memberId: order.memberId,
      items: order.items.map(({ productId, productName, sku, unitPriceSatang, quantity, options }) => ({
        productId, productName, sku, unitPriceSatang, quantity, options: [...options],
      })),
    }
  }
}
