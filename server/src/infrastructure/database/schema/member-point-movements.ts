import { sql } from 'drizzle-orm'
import { check, index, integer, pgEnum, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { createdAt, id } from '../columns'
import { members } from './members'
import { priceQuotes } from './price-quotes'
import { sales } from './sales'
import { users } from './users'

export const pointMovementKind = pgEnum('point_movement_kind', [
  'earn',
  'redeem',
  'void_earn',
  'void_redeem',
  'adjust',
])

// Append-only ledger: rows are never updated or deleted, and a member's cached
// points_balance only moves in the same unit of work as the row that moved it.
export const memberPointMovements = pgTable(
  'member_point_movements',
  {
    id: id(),
    memberId: integer()
      .notNull()
      .references(() => members.id),
    kind: pointMovementKind().notNull(),
    // Signed: earn adds points, redeem and void_earn take them away.
    points: integer().notNull(),
    saleId: integer().references(() => sales.id),
    quoteId: integer().references(() => priceQuotes.id),
    reason: text(),
    createdById: integer()
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    index('member_point_movements_member_idx').on(table.memberId, table.createdAt),
    // A sale earns once and a sale returns its points once; the same for a quote's redemption.
    uniqueIndex('member_point_movements_sale_kind_unique')
      .on(table.saleId, table.kind)
      .where(sql`${table.saleId} is not null`),
    uniqueIndex('member_point_movements_quote_kind_unique')
      .on(table.quoteId, table.kind)
      .where(sql`${table.quoteId} is not null`),
    check('member_point_movements_points_nonzero', sql`${table.points} <> 0`),
    check(
      'member_point_movements_source',
      sql`${table.kind} = 'adjust' or ${table.saleId} is not null or ${table.quoteId} is not null`,
    ),
  ],
)
