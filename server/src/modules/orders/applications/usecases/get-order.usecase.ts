import type { IOrderRepository } from '../ports/order.repository'
import { inBranch } from '../services/order-access'
import { inject, injectable } from 'tsyringe'
import { orderRepositoryToken } from '../ports/order.repository'

/** Query. */
@injectable()
export class GetOrderUseCase {
  constructor(@inject(orderRepositoryToken) private readonly orders: IOrderRepository) {}

  async execute(id: number, branchId: number) {
    return inBranch(await this.orders.findById(id), branchId)
  }
}
