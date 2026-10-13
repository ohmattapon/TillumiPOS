import type { IOrderRepository } from '../ports/order.repository'
import { inject, injectable } from 'tsyringe'
import { listOrdersSchema } from '../schemas/order-schemas'
import { orderRepositoryToken } from '../ports/order.repository'

/** Query. */
@injectable()
export class ListOrdersUseCase {
  constructor(@inject(orderRepositoryToken) private readonly orders: IOrderRepository) {}

  /** Open orders unless another status is asked for. */
  async execute(input: unknown, branchId: number) {
    const query = listOrdersSchema.parse(input)
    return this.orders.findAll({ ...query, status: query.status ?? 'open', branchId })
  }
}
