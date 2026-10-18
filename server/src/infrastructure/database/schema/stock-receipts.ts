import { index, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core'
import { createdAt, id } from '../columns'
import { branches } from './branches'
import { products } from './products'
import { users } from './users'
export const stockReceipts = pgTable('stock_receipts', {
  id: id(),
  branchId: integer().notNull().references(() => branches.id),
  receivedById: integer().notNull().references(() => users.id),
  receivedByName: text().notNull(),
  note: text(),
  createdAt: createdAt(),
}, table => [index().on(table.branchId, table.id)])
export const stockReceiptItems = pgTable('stock_receipt_items', {
  receiptId: integer().notNull().references(() => stockReceipts.id),
  productId: integer().notNull().references(() => products.id),
  sku: text().notNull(),
  name: text().notNull(),
  quantity: integer().notNull(),
  balanceAfter: integer().notNull(),
}, table => [primaryKey({ columns: [table.receiptId, table.productId] })])
