/**
 * Whether an order may be changed. An order whose price a QR is waiting on must not change, or the money
 * would arrive for a bill that no longer matches. The quotes module answers it.
 */
export interface IOrderEditLock {
  /** Throws ORDER_LOCKED_BY_QR_PAYMENT when a QR holds a quote of this order. */
  assertEditable(orderId: number): Promise<void>
}

const token: unique symbol = Symbol('IOrderEditLock')
export const orderEditLockToken = token.toString()
