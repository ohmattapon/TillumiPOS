import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import type { QuoteLine } from '../../../domains/price-quote.domain'
import type { SaleMember, SalePromotion } from '../../../domains/sale.domain'
import { id, timestamps } from '../columns'
import { branches } from './branches'
import { members } from './members'
import { orders } from './orders'
import { sales } from './sales'
import { vatMode } from './shop-settings'
import { users } from './users'

export const quoteStatus = pgEnum('quote_status', ['open', 'reserved', 'consumed', 'cancelled'])

// A cart the server priced and pinned. `qr_reference` is the reference 1 of the QR holding it while it is
// `reserved`; `sale_id` is the sale made from it, which is what stops a quote being sold twice.
export const priceQuotes = pgTable(
  'price_quotes',
  {
    id: id(),
    branchId: integer()
      .notNull()
      .references(() => branches.id),
    memberId: integer().references(() => members.id),
    member: jsonb().$type<SaleMember>(),
    orderId: integer().references(() => orders.id),
    lines: jsonb().$type<QuoteLine[]>().notNull(),
    promotion: jsonb().$type<SalePromotion>(),
    subtotalSatang: integer().notNull(),
    discountSatang: integer().notNull().default(0),
    vatMode: vatMode().notNull(),
    vatRateBp: integer().notNull(),
    vatSatang: integer().notNull(),
    totalSatang: integer().notNull(),
    status: quoteStatus().notNull().default('open'),
    qrReference: text(),
    saleId: integer().references(() => sales.id),
    createdById: integer()
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('price_quotes_qr_reference_unique').on(table.qrReference),
    uniqueIndex('price_quotes_sale_id_unique').on(table.saleId),
    index('price_quotes_order_status_idx').on(table.orderId, table.status),
  ],
)
