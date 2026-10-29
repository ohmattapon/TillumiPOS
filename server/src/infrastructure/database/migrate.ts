import { migrate } from 'drizzle-orm/bun-sql/migrator'
import { client, db } from '../../libs/db'
import { backfillSaleLines } from './backfill-sale-lines'
import { MIGRATIONS_FOLDER } from './migrations-folder'

try {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
  console.log('Migrations applied')
  try {
    // Idempotent: once every line has its share, this selects nothing, so it is safe on every start.
    console.log(`Line shares filled for ${await backfillSaleLines()} sales`)
  } catch (error) {
    // The schema is already migrated, so a corrupt old bill must not stop the app from starting (the
    // entrypoint runs with set -e). Reports show a note about unallocated lines until this is fixed.
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Line shares of old sales could not be filled: ${message}. Reports will show a note until it is fixed`)
  }
} finally {
  await client.close()
}
