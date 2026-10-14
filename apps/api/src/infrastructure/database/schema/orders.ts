import { index, integer, jsonb, pgEnum, pgTable, text, unique } from 'drizzle-orm/pg-core'
import { id, timestamps } from '../columns'
import { branches } from './branches'
import type { StoredLineOption } from './modifiers'
import { products } from './products'
import { sales } from './sales'
import { users } from './users'

export const orderStatus = pgEnum('order_status', ['open', 'paid', 'cancelled'])

// An order is edited while it is open and closed exactly once: paid (it then points at its sale) or cancelled.
export const orders = pgTable(
  'orders',
  {
    id: id(),
    branchId: integer()
      .notNull()
      .references(() => branches.id),
    // Free text such as a table name; real tables arrive with their own feature.
    label: text(),
    status: orderStatus().notNull().default('open'),
    openedById: integer()
      .notNull()
      .references(() => users.id),
    openedByName: text().notNull(),
    saleId: integer().references(() => sales.id),
    cancelReason: text(),
    cancelledById: integer().references(() => users.id),
    ...timestamps,
  },
  (table) => [index().on(table.branchId, table.status)],
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
  },
  (table) => [unique().on(table.orderId, table.productId, table.optionsKey)],
)
