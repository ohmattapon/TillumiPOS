import { injectable } from 'tsyringe'
import type { CommandScope, ICommandReceipts } from '../../shared/ports/command-receipts.port'

const scopeKey = (scope: CommandScope): string =>
  [scope.actorId, scope.branchId, scope.action, scope.key].join(':')

/** Idempotency receipts kept in process memory; lost on restart, like all demo data. */
@injectable()
export class MemoryCommandReceipts implements ICommandReceipts {
  private readonly receipts = new Map<string, { requestHash: string; result: unknown }>()

  // No-op by design: a single process has no concurrent transactions to
  // serialize, so there is nothing to lock. This must stay a no-op only
  // here — the drizzle twin takes a real advisory lock instead.
  async lock(_scope: CommandScope): Promise<void> {}

  async find(scope: CommandScope): Promise<{ requestHash: string; result: unknown } | null> {
    return this.receipts.get(scopeKey(scope)) ?? null
  }

  async create(scope: CommandScope, requestHash: string, result: unknown): Promise<void> {
    this.receipts.set(scopeKey(scope), { requestHash, result })
  }
}
