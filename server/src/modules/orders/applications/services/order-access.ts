import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { OrderEntity } from '../../../../domains/order.domain'

/** Who is acting, and in which branch. Orders belong to a branch and are invisible from any other. */
export interface OrderActor {
  user: { id: number; displayName: string }
  branch: { id: number; code: string }
}

/** An order of this branch, or not found: another branch's orders are not even acknowledged. */
export function inBranch(order: OrderEntity | null, branchId: number): OrderEntity {
  if (!order || order.branchId !== branchId) throw new DomainNotFoundError('ไม่พบออเดอร์', 'ORDER_NOT_FOUND')
  return order
}
