import { integer, timestamp } from 'drizzle-orm/pg-core'

export const id = () => integer().primaryKey().generatedAlwaysAsIdentity()

export const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow()

export const timestamps = {
  createdAt: createdAt(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}
