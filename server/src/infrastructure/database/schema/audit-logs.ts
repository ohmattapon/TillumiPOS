import { bigint, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { branches } from './branches'
import { users } from './users'

/** Append-only records, written in the business command's transaction. */
export const auditLogs = pgTable('audit_logs', {
  id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  actorId: integer().references(() => users.id),
  actorName: text().notNull(),
  branchId: integer().references(() => branches.id),
  action: text().notNull(),
  entityType: text().notNull(),
  entityId: text().notNull(),
  summary: text().notNull(),
  before: jsonb(),
  after: jsonb(),
  reason: text(),
}, (table) => [index().on(table.at.desc()), index().on(table.actorId, table.at), index().on(table.action, table.at)])
