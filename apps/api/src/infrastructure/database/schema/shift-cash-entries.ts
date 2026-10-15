import { check, index, integer, pgEnum, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { createdAt, id } from '../columns'
import { sales } from './sales'
import { shifts } from './shifts'
import { users } from './users'

export const shiftCashEntryKind = pgEnum('shift_cash_entry_kind', ['cash_sale', 'cash_in', 'cash_out', 'cash_refund'])

export const shiftCashEntries = pgTable(
  'shift_cash_entries',
  {
    id: id(),
    shiftId: integer().notNull().references(() => shifts.id),
    kind: shiftCashEntryKind().notNull(),
    amountSatang: integer().notNull(),
    saleId: integer().references(() => sales.id),
    actorId: integer().notNull().references(() => users.id),
    actorName: text().notNull(),
    reason: text(),
    createdAt: createdAt(),
  },
  (table) => [
    check('shift_cash_entries_amount_positive', sql`${table.amountSatang} > 0`),
    index().on(table.shiftId, table.createdAt),
    uniqueIndex('shift_cash_entries_one_refund_per_sale')
      .on(table.saleId)
      .where(sql`${table.kind} = 'cash_refund'`),
  ],
)
