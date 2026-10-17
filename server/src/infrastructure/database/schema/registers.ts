import { boolean, index, integer, pgTable, text, unique } from 'drizzle-orm/pg-core'
import { id, timestamps } from '../columns'
import { branches } from './branches'

export const registers = pgTable(
  'registers',
  {
    id: id(),
    branchId: integer().notNull().references(() => branches.id),
    code: text().notNull(),
    name: text().notNull(),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [unique().on(table.branchId, table.code), index().on(table.branchId, table.isActive)],
)
