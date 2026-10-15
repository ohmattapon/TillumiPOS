import { index, integer, jsonb, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core'
import { createdAt, id } from '../columns'
import { branches } from './branches'
import { users } from './users'

/** Successful idempotent commands only; inserted in the same transaction as the command result. */
export const commandReceipts = pgTable(
  'command_receipts',
  {
    id: id(),
    actorId: integer().notNull().references(() => users.id),
    branchId: integer().notNull().references(() => branches.id),
    action: text().notNull(),
    key: uuid().notNull(),
    requestHash: text().notNull(),
    result: jsonb().notNull(),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.actorId, table.branchId, table.action, table.key), index().on(table.createdAt)],
)
