import { index, integer, pgEnum, pgTable, text, unique } from 'drizzle-orm/pg-core'
import { id, timestamps } from '../columns'
import { branches } from './branches'
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
  },
  (table) => [unique().on(table.orderId, table.productId)],
)
