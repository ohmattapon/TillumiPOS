import type { NewOrder, OrderEntity, OrderStatus } from '../../../../domains/order.domain'
import type { Page } from '../../../../domains/page'

export interface IFindOrdersQuery {
  /** Only this branch's orders are listed. */
  branchId: number
  status?: OrderStatus
  limit?: number
  offset?: number
}

export interface IOrderRepository {
  /** Stores a new open order with its lines. */
  create(order: NewOrder): Promise<OrderEntity>
  findById(id: number): Promise<OrderEntity | null>
  /** Like findById, but row-locks the order until the surrounding unit of work ends. */
  findByIdForUpdate(id: number): Promise<OrderEntity | null>
  /** One page, oldest first (the one that has waited longest), with the total that match. */
  findAll(query: IFindOrdersQuery): Promise<Page<OrderEntity>>
  /** Writes the label, status, sale and cancellation, and replaces the lines with the entity's. */
  save(order: OrderEntity): Promise<OrderEntity>
}

const orderRepositoryTokenSymbol: unique symbol = Symbol('IOrderRepository')
export const orderRepositoryToken = orderRepositoryTokenSymbol.toString()
