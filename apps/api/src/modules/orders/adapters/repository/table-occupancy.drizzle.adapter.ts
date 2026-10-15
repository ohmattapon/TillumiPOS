import { and, count, eq, isNotNull, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { orderItems, orders } from '../../../../infrastructure/database/schema/orders'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { ITableOccupancy, TableOccupancy } from '../../../tables/applications/ports/table-occupancy.port'

/** Answers the tables module's question from the orders' own data, so it never reads our tables. */
@injectable()
export class DrizzleTableOccupancy implements ITableOccupancy {
  async byTable(branchId: number) {
    const rows = await currentExecutor()
      .select({
        tableId: orders.tableId,
        openOrders: sql<number>`count(distinct ${orders.id})`.mapWith(Number),
        openTotalSatang: sql<number>`coalesce(sum(${orderItems.unitPriceSatang} * ${orderItems.quantity}), 0)`.mapWith(
          Number,
        ),
      })
      .from(orders)
      .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
      .where(and(eq(orders.branchId, branchId), eq(orders.status, 'open'), isNotNull(orders.tableId)))
      .groupBy(orders.tableId)

    return new Map<number, TableOccupancy>(
      rows.map((row) => [row.tableId!, { openOrders: row.openOrders, openTotalSatang: row.openTotalSatang }]),
    )
  }

  async openOrderCount(tableId: number) {
    const [row] = await currentExecutor()
      .select({ total: count() })
      .from(orders)
      .where(and(eq(orders.tableId, tableId), eq(orders.status, 'open')))
    return row!.total
  }
}
