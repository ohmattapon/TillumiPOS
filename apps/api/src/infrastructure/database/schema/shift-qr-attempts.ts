import { index, integer, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { createdAt, id } from '../columns'
import { branches } from './branches'
import { qrPayments } from './qr-payments'
import { shifts } from './shifts'
import { users } from './users'

export const qrAttemptState = pgEnum('qr_attempt_state', ['creating', 'ready', 'failed', 'unknown'])

// Written before the bank is called, so a QR whose creation was interrupted (crash, timeout, lost answer)
// leaves a trace that has to be resolved. A shift cannot be counted while one is `creating` or `unknown`.
export const shiftQrAttempts = pgTable(
  'shift_qr_attempts',
  {
    id: id(),
    originShiftId: integer()
      .notNull()
      .references(() => shifts.id),
    branchId: integer()
      .notNull()
      .references(() => branches.id),
    // Reserved before the call: the same reference 1 the bank is given.
    reference: text().notNull().unique(),
    amountSatang: integer().notNull(),
    state: qrAttemptState().notNull().default('creating'),
    qrPaymentId: integer().references(() => qrPayments.id),
    // Base64 PNG the bank returned, kept so a retried request can show the same QR again.
    qrImage: text(),
    actorId: integer()
      .notNull()
      .references(() => users.id),
    actorName: text().notNull(),
    idempotencyKey: uuid().notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.actorId, table.idempotencyKey), index().on(table.originShiftId, table.state)],
)
