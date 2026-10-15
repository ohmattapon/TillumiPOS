import { and, desc, eq, inArray, max, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { identityOf } from '../../../../domains/order.domain'
import { planVoids } from '../../../../domains/kitchen.domain'
import { kitchenTickets, kitchenTicketLines } from '../../../../infrastructure/database/schema/kitchen'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IKitchenTickets } from '../../../orders/applications/ports/kitchen-tickets.port'

/** The orders module's view of the kitchen. It reads and writes only kitchen tables. */
@injectable()
export class DrizzleKitchenTickets implements IKitchenTickets {
  async sentByLine(orderIds: readonly number[]) {
    const result = new Map<number, Map<string, number>>()
    if (orderIds.length === 0) return result

    const rows = await currentExecutor()
      .select({
        orderId: kitchenTickets.orderId,
        productId: kitchenTicketLines.productId,
        optionsKey: kitchenTicketLines.optionsKey,
        net: sql<number>`coalesce(sum(${kitchenTicketLines.quantity} - ${kitchenTicketLines.voidedQuantity}), 0)`.mapWith(Number),
      })
      .from(kitchenTicketLines)
      .innerJoin(kitchenTickets, eq(kitchenTickets.id, kitchenTicketLines.ticketId))
      .where(inArray(kitchenTickets.orderId, [...orderIds]))
      .groupBy(kitchenTickets.orderId, kitchenTicketLines.productId, kitchenTicketLines.optionsKey)

    for (const row of rows) {
      const lines = result.get(row.orderId) ?? new Map<string, number>()
      lines.set(identityOf(row.productId, row.optionsKey), row.net)
      result.set(row.orderId, lines)
    }
    return result
  }

  async hasPending(orderId: number) {
    const [row] = await currentExecutor()
      .select({ pending: sql<number>`count(*)`.mapWith(Number) })
      .from(kitchenTickets)
      .where(and(eq(kitchenTickets.orderId, orderId), eq(kitchenTickets.status, 'pending')))
    return (row?.pending ?? 0) > 0
  }

  async reconcile(orderId: number, quantities: ReadonlyMap<string, number>) {
    const lines = await currentExecutor()
      .select({
        id: kitchenTicketLines.id,
        ticketId: kitchenTicketLines.ticketId,
        productId: kitchenTicketLines.productId,
        optionsKey: kitchenTicketLines.optionsKey,
        quantity: kitchenTicketLines.quantity,
        voidedQuantity: kitchenTicketLines.voidedQuantity,
      })
      .from(kitchenTicketLines)
      .innerJoin(kitchenTickets, eq(kitchenTickets.id, kitchenTicketLines.ticketId))
      .where(and(eq(kitchenTickets.orderId, orderId), sql`${kitchenTicketLines.quantity} > ${kitchenTicketLines.voidedQuantity}`))
      .orderBy(desc(kitchenTicketLines.ticketId), desc(kitchenTicketLines.id))

    const byIdentity = new Map<string, typeof lines>()
    for (const line of lines) {
      const key = identityOf(line.productId, line.optionsKey)
      byIdentity.set(key, [...(byIdentity.get(key) ?? []), line])
    }

    for (const [key, group] of byIdentity) {
      for (const step of planVoids(group, quantities.get(key) ?? 0))
        await currentExecutor()
          .update(kitchenTicketLines)
          .set({ voidedQuantity: sql`${kitchenTicketLines.voidedQuantity} + ${step.take}` })
          .where(eq(kitchenTicketLines.id, step.lineId))
    }
  }

  async moveTickets(fromOrderId: number, toOrderId: number) {
    const moving = await currentExecutor()
      .select()
      .from(kitchenTickets)
      .where(eq(kitchenTickets.orderId, fromOrderId))
      .orderBy(kitchenTickets.id)

    // Each moved ticket takes the next free round of its station in the destination, so no round number repeats.
    for (const ticket of moving) {
      const [latest] = await currentExecutor()
        .select({ latest: max(kitchenTickets.roundNo) })
        .from(kitchenTickets)
        .where(and(eq(kitchenTickets.orderId, toOrderId), eq(kitchenTickets.stationId, ticket.stationId)))
      await currentExecutor()
        .update(kitchenTickets)
        .set({ orderId: toOrderId, roundNo: (latest?.latest ?? 0) + 1 })
        .where(eq(kitchenTickets.id, ticket.id))
    }
  }
}
