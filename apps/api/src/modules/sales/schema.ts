import { date, index, integer, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { createdAt, id } from '../../infrastructure/database/columns'
import { products } from '../../infrastructure/database/schema/products'
import { users } from '../../infrastructure/database/schema/users'

export const saleStatus = pgEnum('sale_status', ['completed', 'voided'])
export const paymentMethod = pgEnum('payment_method', ['cash', 'promptpay', 'card'])

// One row per business day; row-locked on increment so receipt numbers have no gaps.
export const receiptCounters = pgTable('receipt_counters', {
  day: date().primaryKey(),
  lastNumber: integer().notNull(),
})

// A sale is never edited or deleted. Mistakes are corrected by voiding it.
export const sales = pgTable(
  'sales',
  {
    id: id(),
    receiptNo: text().notNull().unique(),
    status: saleStatus().notNull().default('completed'),
    subtotalSatang: integer().notNull(),
    discountSatang: integer().notNull().default(0),
    totalSatang: integer().notNull(),
    // VAT contained in totalSatang.
    vatSatang: integer().notNull(),
    paidSatang: integer().notNull(),
    changeSatang: integer().notNull(),
    cashierId: integer()
      .notNull()
      .references(() => users.id),
    cashierName: text().notNull(),
    voidedById: integer().references(() => users.id),
    voidedAt: timestamp({ withTimezone: true }),
    voidReason: text(),
    createdAt: createdAt(),
  },
  (table) => [index().on(table.createdAt)],
)

export const saleItems = pgTable(
  'sale_items',
  {
    id: id(),
    saleId: integer()
      .notNull()
      .references(() => sales.id),
    productId: integer()
      .notNull()
      .references(() => products.id),
    // Snapshots, so later product edits never change an old receipt.
    productName: text().notNull(),
    sku: text().notNull(),
    unitPriceSatang: integer().notNull(),
    unitCostSatang: integer().notNull(),
    quantity: integer().notNull(),
    lineTotalSatang: integer().notNull(),
  },
  (table) => [index().on(table.saleId), index().on(table.productId)],
)

export const payments = pgTable(
  'payments',
  {
    id: id(),
    saleId: integer()
      .notNull()
      .references(() => sales.id),
    method: paymentMethod().notNull(),
    amountSatang: integer().notNull(),
  },
  (table) => [index().on(table.saleId)],
)
