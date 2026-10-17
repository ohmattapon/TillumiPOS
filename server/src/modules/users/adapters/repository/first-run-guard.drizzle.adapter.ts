import { count, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { users } from '../../../../infrastructure/database/schema/users'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IFirstRunGuard } from '../../../setup/applications/ports/first-run-guard.port'

// One fixed key for the whole shop's first-run setup.
const SETUP_LOCK_KEY = 7_301_001

/** Answers the setup module's question from the users' own table, so setup never reads it. */
@injectable()
export class DrizzleFirstRunGuard implements IFirstRunGuard {
  async countUsers() {
    const [row] = await currentExecutor().select({ total: count() }).from(users)
    return row!.total
  }

  async lockAndCountUsers() {
    await currentExecutor().execute(sql`select pg_advisory_xact_lock(${SETUP_LOCK_KEY})`)
    return this.countUsers()
  }
}
