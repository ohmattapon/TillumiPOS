import { and, count, eq, inArray, max } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { KitchenTicketEntity, type KitchenLine, type NewKitchenTicket } from '../../../../domains/kitchen.domain'
import type { Page } from '../../../../domains/page'
import { kitchenTickets, kitchenTicketLines } from '../../../../infrastructure/database/schema/kitchen'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IFindPendingTicketsQuery, IKitchenTicketRepository } from '../../applications/ports/kitchen-ticket.repository'

type TicketRow = typeof kitchenTickets.$inferSelect
type LineRow = typeof kitchenTicketLines.$inferSelect

const toLine = (row: LineRow): KitchenLine => ({
  id: row.id,
  productId: row.productId,
  productName: row.productName,
  optionsKey: row.optionsKey,
  optionNames: row.optionNames,
  note: row.note,
  quantity: row.quantity,
  voidedQuantity: row.voidedQuantity,
})

const toEntity = (ticket: TicketRow, lines: LineRow[]) =>
  new KitchenTicketEntity({
    id: ticket.id,
    branchId: ticket.branchId,
    orderId: ticket.orderId,
    stationId: ticket.stationId,
    roundNo: ticket.roundNo,
    status: ticket.status,
    sentById: ticket.sentById,
    doneById: ticket.doneById,
    doneAt: ticket.doneAt,
    createdAt: ticket.createdAt,
    lines: lines.map(toLine),
  })

@injectable()
export class DrizzleKitchenTicketRepository implements IKitchenTicketRepository {
  async nextRoundNo(orderId: number, stationId: number) {
    const [row] = await currentExecutor()
      .select({ latest: max(kitchenTickets.roundNo) })
      .from(kitchenTickets)
      .where(and(eq(kitchenTickets.orderId, orderId), eq(kitchenTickets.stationId, stationId)))
    return (row?.latest ?? 0) + 1
  }

  async create(ticket: NewKitchenTicket) {
    const executor = currentExecutor()
    const [stored] = await executor
      .insert(kitchenTickets)
      .values({
        branchId: ticket.branchId,
        orderId: ticket.orderId,
        stationId: ticket.stationId,
        roundNo: ticket.roundNo,
        sentById: ticket.sentById,
      })
      .returning({ id: kitchenTickets.id })
    await executor.insert(kitchenTicketLines).values(
      ticket.lines.map((line) => ({
        ticketId: stored!.id,
        productId: line.productId,
        productName: line.productName,
        optionsKey: line.optionsKey,
        optionNames: [...line.optionNames],
        note: line.note,
        quantity: line.quantity,
      })),
    )
    return (await this.load(stored!.id, false, undefined))!
  }

  findByIdForUpdate(id: number, branchId: number) {
    return this.load(id, true, branchId)
  }

  async save(ticket: KitchenTicketEntity) {
    await currentExecutor()
      .update(kitchenTickets)
      .set({ status: ticket.status, doneById: ticket.doneById, doneAt: ticket.doneAt, updatedAt: new Date() })
      .where(eq(kitchenTickets.id, ticket.id))
    return (await this.load(ticket.id, false, undefined))!
  }

  async findPending(query: IFindPendingTicketsQuery): Promise<Page<KitchenTicketEntity>> {
    const matching = and(
      eq(kitchenTickets.branchId, query.branchId),
      eq(kitchenTickets.stationId, query.stationId),
      eq(kitchenTickets.status, 'pending'),
    )
    const headers = await currentExecutor()
      .select()
      .from(kitchenTickets)
      .where(matching)
      .orderBy(kitchenTickets.createdAt, kitchenTickets.id)
      .limit(query.limit ?? 100)
      .offset(query.offset ?? 0)
    const [counted] = await currentExecutor().select({ total: count() }).from(kitchenTickets).where(matching)

    const lines = headers.length
      ? await currentExecutor()
          .select()
          .from(kitchenTicketLines)
          .where(
            inArray(
              kitchenTicketLines.ticketId,
              headers.map((header) => header.id),
            ),
          )
          .orderBy(kitchenTicketLines.id)
      : []

    return {
      items: headers.map((header) => toEntity(header, lines.filter((line) => line.ticketId === header.id))),
      total: counted!.total,
    }
  }

  private async load(id: number, lock: boolean, branchId: number | undefined): Promise<KitchenTicketEntity | null> {
    const headerQuery = currentExecutor()
      .select()
      .from(kitchenTickets)
      .where(
        and(eq(kitchenTickets.id, id), branchId === undefined ? undefined : eq(kitchenTickets.branchId, branchId)),
      )
    const [header] = await (lock ? headerQuery.for('update') : headerQuery)
    if (!header) return null
    const lines = await currentExecutor()
      .select()
      .from(kitchenTicketLines)
      .where(eq(kitchenTicketLines.ticketId, id))
      .orderBy(kitchenTicketLines.id)
    return toEntity(header, lines)
  }
}
