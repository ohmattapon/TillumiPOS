import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, pgTable, text } from 'drizzle-orm/pg-core'
import { id, timestamps } from '../columns'

export const members = pgTable(
  'members',
  {
    id: id(),
    name: text().notNull(),
    phone: text().notNull().unique(),
    isActive: boolean().notNull().default(true),
    // The sum of the movement ledger, kept here so a cart can read it without adding up rows.
    pointsBalance: integer().notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index('members_name_idx').on(table.name),
    check('members_points_balance_non_negative', sql`${table.pointsBalance} >= 0`),
  ],
)
