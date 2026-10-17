import { check, index, integer, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { id, timestamps } from '../columns'
import { branches } from './branches'
import { sales } from './sales'
import { shifts } from './shifts'
import { users } from './users'

export const qrPaymentStatus = pgEnum('qr_payment_status', ['pending', 'paid', 'cancelled'])

// One QR shown to one customer for one amount. `paid` is set only from what the bank itself reports.
// When the sale is made it points here through sale_id, which is what stops a payment being used twice.
export const qrPayments = pgTable(
  'qr_payments',
  {
    id: id(),
    branchId: integer()
      .notNull()
      .references(() => branches.id),
    // Reference 1 sent to the bank (A-Z, 0-9): how a payment is recognized.
    reference: text().notNull().unique(),
    amountSatang: integer().notNull(),
    status: qrPaymentStatus().notNull().default('pending'),
    qrRawData: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    bankTransactionId: text(),
    payerName: text(),
    paidAt: timestamp({ withTimezone: true }),
    lastCheckedAt: timestamp({ withTimezone: true }),
    saleId: integer().references(() => sales.id),
    // The shift that asked for the QR. Not the shift of the sale, which may be recorded later. Null before shifts.
    originShiftId: integer().references(() => shifts.id),
    // An owner's decision that this money will never get a sale here (e.g. refunded at the bank).
    dismissedAt: timestamp({ withTimezone: true }),
    dismissedById: integer().references(() => users.id),
    dismissReason: text(),
    createdById: integer()
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (table) => [
    index().on(table.branchId, table.status),
    index().on(table.originShiftId),
    check('qr_payments_amount_positive', sql`${table.amountSatang} > 0`),
  ],
)
