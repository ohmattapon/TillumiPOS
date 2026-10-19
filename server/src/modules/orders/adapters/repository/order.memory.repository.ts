import { inject, injectable } from 'tsyringe'
import { OrderEntity, type NewOrder, type OrderEntityProps, type OrderItem } from '../../../../domains/order.domain'
import type { Page } from '../../../../domains/page'
import type { IClock } from '../../../shared/ports/clock.port'
import { TOKENS } from '../../../tokens'
import type { IFindOrdersQuery, IOrderRepository } from '../../applications/ports/order.repository'

/**
 * No-database order store: one Map for headers plus a line-id counter,
 * ids assigned from 1 in creation order. Lines keep their ids across saves:
 * kept lines only change quantity and note, new lines are appended with
 * fresh ids, and removed lines are dropped, like the drizzle twin.
 */
@injectable()
export class MemoryOrderRepository implements IOrderRepository {
  private readonly rows = new Map<number, OrderEntityProps>()
  private nextId = 1
  private nextLineId = 1

  constructor(@inject(TOKENS.Clock) private readonly clock: IClock) {}

  async create(order: NewOrder) {
    const now = this.clock.now()
    const stored: OrderEntityProps = {
      memberId: order.memberId ?? null,
      id: this.nextId++,
      branchId: order.branchId,
      label: order.label,
      tableId: order.tableId,
      status: 'open',
      openedById: order.openedById,
      openedByName: order.openedByName,
      saleId: null,
      cancelReason: null,
      cancelledById: null,
      mergedIntoId: null,
      createdAt: now,
      updatedAt: now,
      items: order.items.map((item) => ({ ...item, lineId: this.nextLineId++, options: [...item.options] })),
    }
    this.rows.set(stored.id, stored)
    return new OrderEntity(stored)
  }

  async findById(id: number) {
    const row = this.rows.get(id)
    return row ? new OrderEntity(row) : null
  }

  async findByIdForUpdate(id: number) {
    // No-op by design: a single process has no concurrent transactions to
    // serialize, so there is nothing to lock. This must stay a no-op only
    // here — the drizzle twin takes a real row lock instead.
    return this.findById(id)
  }

  async findAll(query: IFindOrdersQuery): Promise<Page<OrderEntity>> {
    const matching = [...this.rows.values()].filter(
      (row) =>
        row.branchId === query.branchId &&
        (query.status === undefined || row.status === query.status) &&
        (query.tableId === undefined || row.tableId === query.tableId) &&
        (query.excludeId === undefined || row.id !== query.excludeId),
    )
    const ordered = matching.sort((a, b) => a.id - b.id)
    return {
      items: ordered
        .slice(query.offset ?? 0, (query.offset ?? 0) + (query.limit ?? 200))
        .map((row) => new OrderEntity(row)),
      total: matching.length,
    }
  }

  async save(order: OrderEntity) {
    const stored = this.rows.get(order.id)
    // The drizzle twin's update touches zero rows here and the reload below
    // answers null; only reachable if the row vanished mid-command.
    if (!stored) return (await this.findById(order.id))!
    const snapshot = order.toSnapshot()
    const kept = new Map(snapshot.items.filter((item) => item.lineId > 0).map((item) => [item.lineId, item]))
    const lines: OrderItem[] = []
    for (const line of stored.items) {
      const next = kept.get(line.lineId)
      // A kept line only changes quantity and note, like the drizzle twin's
      // SET clause; a stored line the entity no longer holds is dropped.
      if (next) lines.push({ ...line, quantity: next.quantity, note: next.note })
    }
    for (const item of snapshot.items.filter((item) => item.lineId === 0))
      lines.push({ ...item, lineId: this.nextLineId++, options: [...item.options] })
    const next: OrderEntityProps = {
      ...stored,
      memberId: snapshot.memberId,
      label: snapshot.label,
      tableId: snapshot.tableId,
      status: snapshot.status,
      saleId: snapshot.saleId,
      cancelReason: snapshot.cancelReason,
      cancelledById: snapshot.cancelledById,
      mergedIntoId: snapshot.mergedIntoId,
      updatedAt: this.clock.now(),
      items: lines,
    }
    this.rows.set(next.id, next)
    return (await this.findById(next.id))!
  }

  /**
   * Open orders of the branch sitting on a table, oldest first. Not part of
   * the port: the table-occupancy twin in this module reads through here so
   * orders never grows a table-scoped query for one consumer.
   */
  async findOpenOnTables(branchId: number): Promise<OrderEntity[]> {
    return [...this.rows.values()]
      .filter((row) => row.branchId === branchId && row.status === 'open' && row.tableId !== null)
      .sort((a, b) => a.id - b.id)
      .map((row) => new OrderEntity(row))
  }

  /**
   * How many open orders sit on one table. Not part of the port: the
   * table-occupancy twin reads through here; the port's findAll has no
   * branchless table query.
   */
  async countOpenForTable(tableId: number): Promise<number> {
    return [...this.rows.values()].filter((row) => row.tableId === tableId && row.status === 'open').length
  }
}
