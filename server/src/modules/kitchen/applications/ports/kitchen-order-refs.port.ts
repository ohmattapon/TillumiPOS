/**
 * What the board shows about an order: its label and the table it is on now. Owned by the kitchen,
 * answered by the orders module from its own data, so the kitchen never reads the orders table itself.
 */
export interface IKitchenOrderRefs {
  refsOf(orderIds: readonly number[]): Promise<Map<number, { label: string | null; tableId: number | null }>>
}

const kitchenOrderRefsTokenSymbol: unique symbol = Symbol('IKitchenOrderRefs')
export const kitchenOrderRefsToken = kitchenOrderRefsTokenSymbol.toString()
