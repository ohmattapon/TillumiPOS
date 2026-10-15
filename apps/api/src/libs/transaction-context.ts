import { AsyncLocalStorage } from 'node:async_hooks'
import { db, type Executor, type Tx } from './db'

interface TransactionContext {
  executor: Tx
  afterCommit: Map<string, () => Promise<void>>
}
const activeTransaction = new AsyncLocalStorage<TransactionContext>()

/** What repositories query through: the transaction in progress, or the plain connection. */
export const currentExecutor = (): Executor => activeTransaction.getStore()?.executor ?? db

export const inTransaction = () => activeTransaction.getStore() !== undefined

/** Infrastructure work that must observe a committed write, deduplicated within one unit of work. */
export async function afterCommit(key: string, action: () => Promise<void>): Promise<void> {
  const context = activeTransaction.getStore()
  if (context) context.afterCommit.set(key, action)
  else await action()
}

/** Runs `work` in one transaction. A call made while one is already open joins it. */
export async function runInTransaction<T>(work: () => Promise<T>): Promise<T> {
  if (activeTransaction.getStore()) return work()
  const effects = new Map<string, () => Promise<void>>()
  const result = await db.transaction((tx) => activeTransaction.run({ executor: tx, afterCommit: effects }, work))
  // Transaction failures return before here, so nothing is invalidated for a rolled-back write.
  for (const effect of effects.values()) {
    try { await effect() } catch { console.warn('[cache] Post-commit cache invalidation failed') }
  }
  return result
}
