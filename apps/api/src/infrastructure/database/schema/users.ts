import { boolean, integer, pgEnum, pgTable, text } from 'drizzle-orm/pg-core'
import { id, timestamps } from '../columns'
import { branches } from './branches'

export const userRole = pgEnum('user_role', ['owner', 'cashier'])
export type UserRole = (typeof userRole.enumValues)[number]

export const users = pgTable('users', {
  id: id(),
  username: text().notNull().unique(),
  passwordHash: text().notNull(),
  displayName: text().notNull(),
  role: userRole().notNull().default('cashier'),
  // The branch this person works in; an owner may act in any branch.
  branchId: integer()
    .notNull()
    .references(() => branches.id),
  isActive: boolean().notNull().default(true),
  ...timestamps,
})
