import { check, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { createdAt, id } from '../columns'
import { branches } from './branches'
import { registers } from './registers'
import { users } from './users'

export const shiftStatus = pgEnum('shift_status', ['open', 'closing', 'closed'])

export const shifts = pgTable(
  'shifts',
  {
    id: id(),
    branchId: integer().notNull().references(() => branches.id),
    registerId: integer().notNull().references(() => registers.id),
    status: shiftStatus().notNull().default('open'),
    openedAt: timestamp({ withTimezone: true }).notNull(),
    openedById: integer().notNull().references(() => users.id),
    openedByName: text().notNull(),
    openingCashSatang: integer().notNull(),
    openingNote: text(),
    currency: text().notNull(),
    timeZone: text().notNull(),
    closingRevision: integer().notNull().default(0),
    closingStartedAt: timestamp({ withTimezone: true }),
    closingStartedById: integer().references(() => users.id),
    closingStartedByName: text(),
    closingExpectedCashSatang: integer(),
    closedAt: timestamp({ withTimezone: true }),
    closedById: integer().references(() => users.id),
    closedByName: text(),
    countedCashSatang: integer(),
    cashDifferenceSatang: integer(),
    differenceReason: text(),
    createdAt: createdAt(),
  },
  (table) => [
    check('shifts_opening_cash_nonnegative', sql`${table.openingCashSatang} >= 0`),
    check('shifts_closing_revision_nonnegative', sql`${table.closingRevision} >= 0`),
    check('shifts_counted_cash_nonnegative', sql`${table.countedCashSatang} IS NULL OR ${table.countedCashSatang} >= 0`),
    uniqueIndex('shifts_one_active_per_register')
      .on(table.registerId)
      .where(sql`${table.status} IN ('open', 'closing')`),
    index().on(table.branchId, table.openedAt),
    index().on(table.registerId, table.status),
  ],
)
