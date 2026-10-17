import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'
import { id, timestamps } from '../columns'
import { branches } from './branches'
import { categories } from './categories'
import { orders } from './orders'
import { products } from './products'
import { users } from './users'

export const kitchenTicketStatus = pgEnum('kitchen_ticket_status', ['pending', 'done'])

// A place that prepares orders. Shared by every branch, like categories.
export const kitchenStations = pgTable('kitchen_stations', {
  id: id(),
  name: text().notNull().unique(),
  sortOrder: integer().notNull().default(0),
  isActive: boolean().notNull().default(true),
  ...timestamps,
})

// Which station a category goes to. A category without a row is not sent to the kitchen.
export const kitchenCategoryStations = pgTable('kitchen_category_stations', {
  categoryId: integer()
    .primaryKey()
    .references(() => categories.id),
  stationId: integer()
    .notNull()
    .references(() => kitchenStations.id),
})

// One round of one order at one station. Its lines are the quantities that went to the kitchen.
export const kitchenTickets = pgTable(
  'kitchen_tickets',
  {
    id: id(),
    branchId: integer()
      .notNull()
      .references(() => branches.id),
    orderId: integer()
      .notNull()
      .references(() => orders.id),
    stationId: integer()
      .notNull()
      .references(() => kitchenStations.id),
    roundNo: integer().notNull(),
    status: kitchenTicketStatus().notNull().default('pending'),
    sentById: integer()
      .notNull()
      .references(() => users.id),
    doneById: integer().references(() => users.id),
    doneAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique().on(table.orderId, table.stationId, table.roundNo),
    index().on(table.branchId, table.stationId, table.status),
    index().on(table.orderId),
  ],
)

export const kitchenTicketLines = pgTable(
  'kitchen_ticket_lines',
  {
    id: id(),
    ticketId: integer()
      .notNull()
      .references(() => kitchenTickets.id, { onDelete: 'cascade' }),
    productId: integer()
      .notNull()
      .references(() => products.id),
    productName: text().notNull(),
    // The same key the order uses for its line: the same product with the same options.
    optionsKey: text().notNull().default(''),
    optionNames: jsonb().$type<string[]>().notNull().default([]),
    note: text(),
    quantity: integer().notNull(),
    voidedQuantity: integer().notNull().default(0),
  },
  (table) => [
    check('kitchen_ticket_lines_voided_range', sql`${table.voidedQuantity} >= 0 and ${table.voidedQuantity} <= ${table.quantity}`),
    check('kitchen_ticket_lines_quantity_positive', sql`${table.quantity} >= 1`),
    index().on(table.ticketId),
    index().on(table.productId, table.optionsKey),
  ],
)
