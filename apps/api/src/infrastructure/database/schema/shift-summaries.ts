import { integer, jsonb, pgTable, timestamp } from 'drizzle-orm/pg-core'
import type { ShiftSummary } from '../../../domains/shift-summary'
import { shifts } from './shifts'

// The report of a shift as it stood when counting started. Written when counting starts, removed if the
// count is cancelled, and never changed once the shift is closed.
export const shiftSummaries = pgTable('shift_summaries', {
  shiftId: integer()
    .primaryKey()
    .references(() => shifts.id),
  summary: jsonb().$type<ShiftSummary>().notNull(),
  capturedAt: timestamp({ withTimezone: true }).notNull(),
})
