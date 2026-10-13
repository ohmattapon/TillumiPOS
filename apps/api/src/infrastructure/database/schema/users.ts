import { boolean, pgEnum, pgTable, text } from 'drizzle-orm/pg-core'
import { id, timestamps } from '../columns'

export const userRole = pgEnum('user_role', ['owner', 'cashier'])
export type UserRole = (typeof userRole.enumValues)[number]

export const users = pgTable('users', {
  id: id(),
  username: text().notNull().unique(),
  passwordHash: text().notNull(),
  displayName: text().notNull(),
  role: userRole().notNull().default('cashier'),
  isActive: boolean().notNull().default(true),
  ...timestamps,
})
