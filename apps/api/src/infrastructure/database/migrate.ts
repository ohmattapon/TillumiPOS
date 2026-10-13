import { migrate } from 'drizzle-orm/bun-sql/migrator'
import { client, db } from '../../libs/db'

await migrate(db, { migrationsFolder: './drizzle' })
console.log('Migrations applied')
await client.close()
