import { and, count, desc, eq, gte, lt, sql, type SQL } from 'drizzle-orm'
import { env } from '../../libs/env'
import { db, type Executor, type Tx } from '../../libs/db'
import { badRequest, conflict, notFound } from '../../shared/errors'
import { container } from 'tsyringe'
import { currentExecutor, runInTransaction } from '../../libs/transaction-context'
import { productRepositoryToken } from '../products/applications/ports/product.repository'
import type { IProductRepository } from '../products/applications/ports/product.repository'
import { InventoryService } from '../inventory/service'
import type { UserResponse as User } from '../users/adapters/controllers/schemas/user.schema'
import type { CreateSale, Sale, SaleHeader, SaleListQuery, SaleSummary, SaleSummaryQuery } from './model'
import { calculateTotals, settlePayments } from './pricing'
import { payments, receiptCounters, saleItems, sales } from './schema'

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

// Bridge until this module is migrated: the products repository reads the ambient transaction.
const productRepository = () => container.resolve<IProductRepository>(productRepositoryToken)

const total = (expression: SQL) => sql<number>`coalesce(sum(${expression}), 0)`.mapWith(Number)

export abstract class SalesService {
  static create(input: CreateSale, cashier: User): Promise<Sale> {
    return runInTransaction(async () => {
      const tx = currentExecutor() as Tx
      // Merge repeated products; Map keeps the order they were added to the cart.
      const quantities = new Map<number, number>()
      for (const item of input.items)
        quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity)

      const locked = await productRepository().findManyForUpdate([...quantities.keys()])
      const productsById = new Map(locked.map((product) => [product.id, product]))

      const lines = [...quantities].map(([productId, quantity]) => {
        const product = productsById.get(productId)
        if (!product) throw badRequest(`ไม่พบสินค้ารหัส ${productId}`, 'PRODUCT_NOT_FOUND')
        if (!product.isActive) throw conflict(`สินค้า "${product.name}" ปิดการขายแล้ว`, 'PRODUCT_INACTIVE')
        if (product.trackStock && product.stockQty < quantity)
          throw conflict(`สินค้า "${product.name}" เหลือ ${product.stockQty} ชิ้น ไม่พอขาย`, 'INSUFFICIENT_STOCK')

        return {
          productId,
          productName: product.name,
          sku: product.sku,
          unitPriceSatang: product.priceSatang,
          unitCostSatang: product.costSatang,
          quantity,
          lineTotalSatang: product.priceSatang * quantity,
        }
      })

      const totals = calculateTotals(lines, input.discountSatang ?? 0, env.vatRateBp)
      const settlement = settlePayments(totals.totalSatang, input.payments)
      const receiptNo = await SalesService.nextReceiptNo(tx)

      const [sale] = await tx
        .insert(sales)
        .values({ receiptNo, ...totals, ...settlement, cashierId: cashier.id, cashierName: cashier.displayName })
        .returning({ id: sales.id })
      const saleId = sale!.id

      await tx.insert(saleItems).values(lines.map((line) => ({ ...line, saleId })))
      await tx.insert(payments).values(input.payments.map((payment) => ({ ...payment, saleId })))

      for (const line of lines)
        await InventoryService.record(tx, {
          productId: line.productId,
          type: 'sale',
          quantity: -line.quantity,
          reference: receiptNo,
          userId: cashier.id,
        })

      return SalesService.getById(saleId, tx)
    })
  }

  static void(id: number, reason: string, user: User): Promise<Sale> {
    return runInTransaction(async () => {
      const tx = currentExecutor() as Tx
      const [sale] = await tx
        .select({ status: sales.status, receiptNo: sales.receiptNo })
        .from(sales)
        .where(eq(sales.id, id))
        .for('update')
      if (!sale) throw notFound('ไม่พบบิลขาย')
      if (sale.status === 'voided') throw conflict('บิลนี้ถูกยกเลิกไปแล้ว', 'ALREADY_VOIDED')

      await tx
        .update(sales)
        .set({ status: 'voided', voidedById: user.id, voidedAt: new Date(), voidReason: reason })
        .where(eq(sales.id, id))

      const items = await tx
        .select({ productId: saleItems.productId, quantity: saleItems.quantity })
        .from(saleItems)
        .where(eq(saleItems.saleId, id))
        .orderBy(saleItems.productId)
      for (const item of items)
        await InventoryService.record(tx, {
          productId: item.productId,
          type: 'void',
          quantity: item.quantity,
          reference: sale.receiptNo,
          note: reason,
          userId: user.id,
        })

      return SalesService.getById(id, tx)
    })
  }

  static async getById(id: number, executor: Executor = db): Promise<Sale> {
    const [header] = await executor.select(headerColumns).from(sales).where(eq(sales.id, id))
    if (!header) throw notFound('ไม่พบบิลขาย')

    const items = await executor
      .select({
        productId: saleItems.productId,
        productName: saleItems.productName,
        sku: saleItems.sku,
        unitPriceSatang: saleItems.unitPriceSatang,
        quantity: saleItems.quantity,
        lineTotalSatang: saleItems.lineTotalSatang,
      })
      .from(saleItems)
      .where(eq(saleItems.saleId, id))
      .orderBy(saleItems.id)
    const paid = await executor
      .select({ method: payments.method, amountSatang: payments.amountSatang })
      .from(payments)
      .where(eq(payments.saleId, id))
      .orderBy(payments.id)

    return { ...header, items, payments: paid }
  }

  static list(query: SaleListQuery): Promise<SaleHeader[]> {
    return db
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

  /** Totals for completed sales created in [from, to). Voided sales are excluded. */
  static async summary({ from, to }: SaleSummaryQuery): Promise<SaleSummary> {
    const inRange = and(eq(sales.status, 'completed'), gte(sales.createdAt, from), lt(sales.createdAt, to))

    const [totals] = await db
      .select({
        saleCount: count(),
        totalSatang: total(sql`${sales.totalSatang}`),
        vatSatang: total(sql`${sales.vatSatang}`),
        discountSatang: total(sql`${sales.discountSatang}`),
        changeSatang: total(sql`${sales.changeSatang}`),
      })
      .from(sales)
      .where(inRange)
    const [cost] = await db
      .select({ costSatang: total(sql`${saleItems.unitCostSatang} * ${saleItems.quantity}`) })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .where(inRange)
    const tendered = await db
      .select({ method: payments.method, amountSatang: total(sql`${payments.amountSatang}`) })
      .from(payments)
      .innerJoin(sales, eq(payments.saleId, sales.id))
      .where(inRange)
      .groupBy(payments.method)
      .orderBy(payments.method)

    const { changeSatang, ...summary } = totals!
    return {
      ...summary,
      profitSatang: summary.totalSatang - cost!.costSatang,
      byMethod: tendered.map((row) =>
        row.method === 'cash' ? { ...row, amountSatang: row.amountSatang - changeSatang } : row,
      ),
    }
  }

  /** Gapless per-day running number, e.g. 20261013-00042. Rolls back with the sale. */
  private static async nextReceiptNo(tx: Tx): Promise<string> {
    const [counter] = await tx
      .insert(receiptCounters)
      .values({ day: sql`(now() at time zone ${env.timeZone})::date`, lastNumber: 1 })
      .onConflictDoUpdate({
        target: receiptCounters.day,
        set: { lastNumber: sql`${receiptCounters.lastNumber} + 1` },
      })
      .returning()
    return `${counter!.day.replaceAll('-', '')}-${String(counter!.lastNumber).padStart(5, '0')}`
  }
}
