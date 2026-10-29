import { migrate } from 'drizzle-orm/bun-sql/migrator'
import { client, db } from '../../libs/db'
import { backfillSaleLines } from './backfill-sale-lines'
import { MIGRATIONS_FOLDER } from './migrations-folder'

await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
console.log('Migrations applied')
// Idempotent: once every line has its share, this selects nothing, so it is safe on every start.
console.log(`Line shares filled for ${await backfillSaleLines()} sales`)
await client.close()
