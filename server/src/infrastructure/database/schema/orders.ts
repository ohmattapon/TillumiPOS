import { index, integer, jsonb, pgEnum, pgTable, text, unique, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { id, timestamps } from '../columns'
import { branches } from './branches'
import { diningTables } from './dining-tables'
import type { StoredLineOption } from './modifiers'
import { products } from './products'
import { sales } from './sales'
import { users } from './users'
import { members } from './members'

export const orderStatus = pgEnum('order_status', ['open', 'paid', 'cancelled', 'merged'])

// An order is edited while it is open and closed exactly once: paid (it then points at its sale) or cancelled.
export const orders = pgTable(
  'orders',
  {
    id: id(),
    memberId: integer().references(() => members.id),
    branchId: integer()
      .notNull()
      .references(() => branches.id),
    // Free text such as a name for a takeaway order.
    label: text(),
    // The table the order is on; null for an order without one (takeaway).
    tableId: integer().references(() => diningTables.id),
    status: orderStatus().notNull().default('open'),
    openedById: integer()
      .notNull()
      .references(() => users.id),
    openedByName: text().notNull(),
    saleId: integer().references(() => sales.id),
    cancelReason: text(),
    cancelledById: integer().references(() => users.id),
    // The order this one was merged into; set when status is merged.
    mergedIntoId: integer().references((): AnyPgColumn => orders.id),
    ...timestamps,
  },
  (table) => [index().on(table.branchId, table.status), index().on(table.tableId)],
)

export const orderItems = pgTable(
  'order_items',
  {
    id: id(),
    orderId: integer()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: integer()
      .notNull()
      .references(() => products.id),
    // Snapshots from when the item was ordered: the customer pays the price they were quoted.
    productName: text().notNull(),
    sku: text().notNull(),
    unitPriceSatang: integer().notNull(),
    quantity: integer().notNull(),
    // The options chosen, as they were when the item was ordered. Existing rows have none.
    options: jsonb().$type<StoredLineOption[]>().notNull().default([]),
    // The chosen option ids, sorted and joined: the same product with different options is a different line.
    optionsKey: text().notNull().default(''),
    // An optional note on this line, such as a customer preference. Always editable. Two lines of one
    // item differ by this note, so the unique constraint below includes it.
    note: text(),
  },
  (table) => [unique().on(table.orderId, table.productId, table.optionsKey, table.note).nullsNotDistinct()],
)
