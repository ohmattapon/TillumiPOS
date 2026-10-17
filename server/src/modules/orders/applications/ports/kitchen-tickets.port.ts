/**
 * What orders need from the kitchen. Owned here, because orders is the caller; the kitchen module answers it.
 * Lines are keyed by lineIdentity (product and options), so a line can be compared with its tickets.
 */
export interface IKitchenTickets {
  /** Units sent to the kitchen and not taken back, per order and line identity. Missing means none. */
  sentByLine(orderIds: readonly number[]): Promise<Map<number, Map<string, number>>>
  /** Whether any ticket of the order is still pending at a station. */
  hasPending(orderId: number): Promise<boolean>
  /**
   * Takes back what the kitchen has beyond `quantities` (line identity to the units the order holds now).
   * An empty map takes back everything, which is what a cancelled order does.
   */
  reconcile(orderId: number, quantities: ReadonlyMap<string, number>): Promise<void>
  /** Re-points every ticket of one order to another, when orders are merged. */
  moveTickets(fromOrderId: number, toOrderId: number): Promise<void>
}

const kitchenTicketsTokenSymbol: unique symbol = Symbol('IKitchenTickets')
export const kitchenTicketsToken = kitchenTicketsTokenSymbol.toString()
