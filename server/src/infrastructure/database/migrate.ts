import { migrate } from 'drizzle-orm/bun-sql/migrator'
import { client, db } from '../../libs/db'
import { MIGRATIONS_FOLDER } from './migrations-folder'

await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
console.log('Migrations applied')
await client.close()
