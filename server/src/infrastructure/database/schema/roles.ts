import { index, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core'
import { id, timestamps } from '../columns'

export const roles = pgTable('roles', {
  id: id(),
  name: text().notNull().unique(),
  systemKey: text().unique(),
  ...timestamps,
})

export const rolePermissions = pgTable('role_permissions', {
  roleId: integer().notNull().references(() => roles.id, { onDelete: 'cascade' }),
  permission: text().notNull(),
}, (table) => [primaryKey({ columns: [table.roleId, table.permission] }), index().on(table.permission)])
