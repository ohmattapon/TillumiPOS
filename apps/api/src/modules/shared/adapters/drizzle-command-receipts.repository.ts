import { and, eq, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { commandReceipts } from '../../../infrastructure/database/schema/command-receipts'
import { currentExecutor } from '../../../libs/transaction-context'
import type { CommandScope, ICommandReceipts } from '../ports/command-receipts.port'

@injectable()
export class DrizzleCommandReceiptsRepository implements ICommandReceipts {
  async lock(scope: CommandScope) {
    const lockKey = [scope.actorId, scope.branchId, scope.action, scope.key].join(':')
    await currentExecutor().execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`)
  }

  async find(scope: CommandScope) {
    const [row] = await currentExecutor()
      .select({ requestHash: commandReceipts.requestHash, result: commandReceipts.result })
      .from(commandReceipts)
      .where(and(
        eq(commandReceipts.actorId, scope.actorId),
        eq(commandReceipts.branchId, scope.branchId),
        eq(commandReceipts.action, scope.action),
        eq(commandReceipts.key, scope.key),
      ))
    return row ?? null
  }

  async create(scope: CommandScope, requestHash: string, result: unknown) {
    await currentExecutor().insert(commandReceipts).values({ ...scope, requestHash, result })
  }
}
