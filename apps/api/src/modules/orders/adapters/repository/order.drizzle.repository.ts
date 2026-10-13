import { and, count, eq, inArray } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { OrderEntity, type NewOrder, type OrderItem } from '../../../../domains/order.domain'
import type { Page } from '../../../../domains/page'
import { orderItems, orders } from '../../../../infrastructure/database/schema/orders'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IFindOrdersQuery, IOrderRepository } from '../../applications/ports/order.repository'

const columns = {
  id: orders.id,
  branchId: orders.branchId,
  label: orders.label,
  status: orders.status,
  openedById: orders.openedById,
  openedByName: orders.openedByName,
  saleId: orders.saleId,
  cancelReason: orders.cancelReason,
  cancelledById: orders.cancelledById,
  createdAt: orders.createdAt,
  updatedAt: orders.updatedAt,
}

const itemColumns = {
  orderId: orderItems.orderId,
  productId: orderItems.productId,
  productName: orderItems.productName,
  sku: orderItems.sku,
  unitPriceSatang: orderItems.unitPriceSatang,
  quantity: orderItems.quantity,
}

@injectable()
export class DrizzleOrderRepository implements IOrderRepository {
  async create(order: NewOrder) {
    const { items, ...values } = order
    const [stored] = await currentExecutor().insert(orders).values(values).returning({ id: orders.id })
    await this.writeItems(stored!.id, items)
    return (await this.findById(stored!.id))!
  }

  findById(id: number) {
    return this.load(id, false)
  }

  findByIdForUpdate(id: number) {
    return this.load(id, true)
  }

  async findAll(query: IFindOrdersQuery): Promise<Page<OrderEntity>> {
    const matching = and(
      eq(orders.branchId, query.branchId),
      query.status ? eq(orders.status, query.status) : undefined,
    )

    const rows = await currentExecutor()
      .select(columns)
      .from(orders)
      .where(matching)
      .orderBy(orders.id)
      .limit(query.limit ?? 200)
      .offset(query.offset ?? 0)
    const [counted] = await currentExecutor().select({ total: count() }).from(orders).where(matching)

    const items = rows.length
      ? await currentExecutor()
          .select(itemColumns)
          .from(orderItems)
          .where(
            inArray(
              orderItems.orderId,
              rows.map((row) => row.id),
            ),
          )
          .orderBy(orderItems.id)
      : []

    return {
      items: rows.map(
        (row) =>
          new OrderEntity({
            ...row,
            items: items.filter((item) => item.orderId === row.id).map(({ orderId: _order, ...item }) => item),
          }),
      ),
      total: counted!.total,
    }
  }

  async save(order: OrderEntity) {
    const { id, items, branchId: _fixed, openedById: _opener, openedByName: _name, createdAt: _created, ...values } =
      order.toSnapshot()

    await currentExecutor()
      .update(orders)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(orders.id, id))
    // The entity is the whole truth about the lines, so they are replaced rather than patched.
    await currentExecutor().delete(orderItems).where(eq(orderItems.orderId, id))
    await this.writeItems(id, items)
    return (await this.findById(id))!
  }

  private async writeItems(orderId: number, items: readonly OrderItem[]) {
    if (items.length > 0)
      await currentExecutor()
        .insert(orderItems)
        .values(items.map((item) => ({ ...item, orderId })))
  }

  private async load(id: number, lock: boolean): Promise<OrderEntity | null> {
    const headerQuery = currentExecutor().select(columns).from(orders).where(eq(orders.id, id))
    const [header] = await (lock ? headerQuery.for('update') : headerQuery)
    if (!header) return null

    const items = await currentExecutor()
      .select(itemColumns)
      .from(orderItems)
      .where(eq(orderItems.orderId, id))
      .orderBy(orderItems.id)

    return new OrderEntity({ ...header, items: items.map(({ orderId: _order, ...item }) => item) })
  }
}
