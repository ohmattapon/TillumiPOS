import { inject, injectable } from 'tsyringe'
import type { NewOrder, OrderEntity } from '../../../../domains/order.domain'
import { orderEditLockToken, type IOrderEditLock } from '../../applications/ports/order-edit-lock.port'
import type { IFindOrdersQuery, IOrderRepository } from '../../applications/ports/order.repository'
import { DrizzleOrderRepository } from './order.drizzle.repository'

/**
 * The order repository with one more rule: an order whose price a QR is waiting on is not written.
 * Every command that changes an order locks it and saves it here, so the rule holds for all of them
 * (adding, removing, merging, splitting, moving, renaming, cancelling) without each one asking.
 * Paying uses the quote up first, so the order that is paid is no longer held when it is saved.
 */
@injectable()
export class GuardedOrderRepository implements IOrderRepository {
  constructor(
    @inject(DrizzleOrderRepository) private readonly orders: DrizzleOrderRepository,
    @inject(orderEditLockToken) private readonly lock: IOrderEditLock,
  ) {}

  create(order: NewOrder) {
    return this.orders.create(order)
  }

  findById(id: number) {
    return this.orders.findById(id)
  }

  findByIdForUpdate(id: number) {
    return this.orders.findByIdForUpdate(id)
  }

  findAll(query: IFindOrdersQuery) {
    return this.orders.findAll(query)
  }

  async save(order: OrderEntity) {
    if (order.id !== 0) await this.lock.assertEditable(order.id)
    return this.orders.save(order)
  }
}
