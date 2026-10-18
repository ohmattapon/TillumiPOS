import { index, integer, pgEnum, pgTable, text } from 'drizzle-orm/pg-core'
import { createdAt, id } from '../columns'
import { branches } from './branches'
import { products } from './products'
import { users } from './users'
import { stockReceipts } from './stock-receipts'

export const stockMovementType = pgEnum('stock_movement_type', ['receive', 'sale', 'void', 'adjust'])
export type StockMovementType = (typeof stockMovementType.enumValues)[number]

// Append-only ledger: rows are never updated or deleted.
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: id(),
    branchId: integer()
      .notNull()
      .references(() => branches.id),
    productId: integer()
      .notNull()
      .references(() => products.id),
    type: stockMovementType().notNull(),
    // Signed: positive adds stock, negative removes it.
    quantity: integer().notNull(),
    balanceAfter: integer().notNull(),
    // Receipt number for sale/void movements.
    reference: text(),
    receiptId: integer().references(() => stockReceipts.id),
    note: text(),
    userId: integer()
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [index().on(table.branchId, table.productId, table.createdAt)],
)
