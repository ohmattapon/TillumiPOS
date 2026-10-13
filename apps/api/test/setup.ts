import { assertConnectedTestDatabase, ensureTestDatabase } from './database'
import { fakeMedia } from './media-server'

// Must happen before anything imports src/libs/env, which reads the environment once.
Bun.env.MEDIA_URL = fakeMedia.url

await ensureTestDatabase()

const { migrate } = await import('drizzle-orm/bun-sql/migrator')
const { client, db } = await import('../src/libs/db')
await assertConnectedTestDatabase(client)
await migrate(db, { migrationsFolder: './drizzle' })
