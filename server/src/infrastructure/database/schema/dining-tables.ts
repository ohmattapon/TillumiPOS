import { boolean, index, integer, pgTable, text, unique } from 'drizzle-orm/pg-core'
import { id, timestamps } from '../columns'
import { branches } from './branches'

// A table on the floor plan of a branch. Its position and size are in layout units (see the domain).
export const diningTables = pgTable(
  'dining_tables',
  {
    id: id(),
    branchId: integer()
      .notNull()
      .references(() => branches.id),
    name: text().notNull(),
    zone: text(),
    seats: integer().notNull().default(4),
    x: integer().notNull().default(20),
    y: integer().notNull().default(20),
    width: integer().notNull().default(120),
    height: integer().notNull().default(80),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [unique().on(table.branchId, table.name), index().on(table.branchId)],
)
