import { inArray } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { orders } from '../../../../infrastructure/database/schema/orders'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IKitchenOrderRefs } from '../../../kitchen/applications/ports/kitchen-order-refs.port'

/** Answers the kitchen's question from the orders' own table. */
@injectable()
export class DrizzleKitchenOrderRefs implements IKitchenOrderRefs {
  async refsOf(orderIds: readonly number[]) {
    if (orderIds.length === 0) return new Map<number, { label: string | null; tableId: number | null }>()
    const rows = await currentExecutor()
      .select({ id: orders.id, label: orders.label, tableId: orders.tableId })
      .from(orders)
      .where(inArray(orders.id, [...orderIds]))
    return new Map(rows.map((row) => [row.id, { label: row.label, tableId: row.tableId }]))
  }
}
