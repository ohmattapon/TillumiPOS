import { and, count, desc, eq, gte, lt, sql, type SQL } from 'drizzle-orm'
import { inject, injectable } from 'tsyringe'
import { SaleEntity, type NewSale } from '../../../../domains/sale.domain'
import { payments, receiptCounters, saleItems, sales } from '../../../../infrastructure/database/schema/sales'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IShopSettings } from '../../../shared/ports/shop-settings.port'
import { TOKENS } from '../../../tokens'
import type { IFindSalesQuery, ISaleHeader, ISaleRepository, ISalesTotals } from '../../applications/ports/sale.repository'

const headerColumns = {
  id: sales.id,
  receiptNo: sales.receiptNo,
  status: sales.status,
  subtotalSatang: sales.subtotalSatang,
  discountSatang: sales.discountSatang,
  totalSatang: sales.totalSatang,
  vatSatang: sales.vatSatang,
  paidSatang: sales.paidSatang,
  changeSatang: sales.changeSatang,
  cashierId: sales.cashierId,
  cashierName: sales.cashierName,
  voidedAt: sales.voidedAt,
  voidReason: sales.voidReason,
  createdAt: sales.createdAt,
}

const itemColumns = {
  productId: saleItems.productId,
  productName: saleItems.productName,
  sku: saleItems.sku,
  unitPriceSatang: saleItems.unitPriceSatang,
  unitCostSatang: saleItems.unitCostSatang,
  quantity: saleItems.quantity,
  lineTotalSatang: saleItems.lineTotalSatang,
}

const total = (expression: SQL) => sql<number>`coalesce(sum(${expression}), 0)`.mapWith(Number)

@injectable()
export class DrizzleSaleRepository implements ISaleRepository {
  constructor(@inject(TOKENS.ShopSettings) private readonly settings: IShopSettings) {}

  async nextReceiptNo() {
    // One row per business day, row-locked on increment, so numbers have no gaps.
    const [counter] = await currentExecutor()
      .insert(receiptCounters)
      .values({ day: sql`(now() at time zone ${this.settings.timeZone})::date`, lastNumber: 1 })
      .onConflictDoUpdate({
        target: receiptCounters.day,
        set: { lastNumber: sql`${receiptCounters.lastNumber} + 1` },
      })
      .returning()
    return counter!.day.replaceAll('-', '') + '-' + String(counter!.lastNumber).padStart(5, '0')
  }

  async create(sale: NewSale, receiptNo: string) {
    const executor = currentExecutor()
    const { items, payments: paid, ...totals } = sale

    const [stored] = await executor
      .insert(sales)
      .values({ receiptNo, ...totals })
      .returning({ id: sales.id })
    const saleId = stored!.id

    await executor.insert(saleItems).values(items.map((item) => ({ ...item, saleId })))
    await executor.insert(payments).values(paid.map((payment) => ({ ...payment, saleId })))

    // Read back rather than assembled here, so defaults (status, created_at) come from the database.
    return (await this.load(saleId, false))!
  }

  findById(id: number) {
    return this.load(id, false)
  }

  findByIdForUpdate(id: number) {
    return this.load(id, true)
  }

  async saveVoid(sale: SaleEntity) {
    await currentExecutor()
      .update(sales)
      .set({ status: sale.status, voidedById: sale.voidedById, voidedAt: sale.voidedAt, voidReason: sale.voidReason })
      .where(eq(sales.id, sale.id))
  }

  findHeaders(query: IFindSalesQuery): Promise<ISaleHeader[]> {
    return currentExecutor()
      .select(headerColumns)
      .from(sales)
      .where(
        and(
          query.from ? gte(sales.createdAt, query.from) : undefined,
          query.to ? lt(sales.createdAt, query.to) : undefined,
        ),
      )
      .orderBy(desc(sales.id))
      .limit(query.limit ?? 100)
  }

  async sumCompleted({ from, to }: { from: Date; to: Date }): Promise<ISalesTotals> {
    const executor = currentExecutor()
    const inPeriod = and(eq(sales.status, 'completed'), gte(sales.createdAt, from), lt(sales.createdAt, to))

    const [totals] = await executor
      .select({
        saleCount: count(),
        totalSatang: total(sql`${sales.totalSatang}`),
        vatSatang: total(sql`${sales.vatSatang}`),
        discountSatang: total(sql`${sales.discountSatang}`),
        changeSatang: total(sql`${sales.changeSatang}`),
      })
      .from(sales)
      .where(inPeriod)
    const [cost] = await executor
      .select({ costSatang: total(sql`${saleItems.unitCostSatang} * ${saleItems.quantity}`) })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .where(inPeriod)
    const tendered = await executor
      .select({ method: payments.method, amountSatang: total(sql`${payments.amountSatang}`) })
      .from(payments)
      .innerJoin(sales, eq(payments.saleId, sales.id))
      .where(inPeriod)
      .groupBy(payments.method)
      .orderBy(payments.method)

    return { ...totals!, costSatang: cost!.costSatang, tendered }
  }

  private async load(id: number, lock: boolean): Promise<SaleEntity | null> {
    const executor = currentExecutor()
    const headerQuery = executor
      .select({ ...headerColumns, voidedById: sales.voidedById })
      .from(sales)
      .where(eq(sales.id, id))
    const [header] = await (lock ? headerQuery.for('update') : headerQuery)
    if (!header) return null

    const items = await executor.select(itemColumns).from(saleItems).where(eq(saleItems.saleId, id)).orderBy(saleItems.id)
    const paid = await executor
      .select({ method: payments.method, amountSatang: payments.amountSatang })
      .from(payments)
      .where(eq(payments.saleId, id))
      .orderBy(payments.id)

    return new SaleEntity({ ...header, items, payments: paid })
  }
}
