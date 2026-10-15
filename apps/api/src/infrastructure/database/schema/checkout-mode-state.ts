import { check, integer, pgTable, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

/** Singleton activation marker: once a shift has been opened, deployment config cannot re-enable v1 money writes. */
export const checkoutModeState = pgTable('checkout_mode_state', {
  id: integer().primaryKey().default(1),
  shiftsActivatedAt: timestamp({ withTimezone: true }).notNull(),
}, (table) => [check('checkout_mode_state_singleton', sql`${table.id} = 1`)])
