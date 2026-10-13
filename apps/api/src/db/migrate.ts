import { migrate } from 'drizzle-orm/bun-sql/migrator'
import { client, db } from './client'

await migrate(db, { migrationsFolder: './drizzle' })
console.log('Migrations applied')
await client.close()
