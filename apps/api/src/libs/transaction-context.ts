import { AsyncLocalStorage } from 'node:async_hooks'
import { db, type Executor, type Tx } from './db'

const activeTransaction = new AsyncLocalStorage<Tx>()

/** What repositories query through: the transaction in progress, or the plain connection. */
export const currentExecutor = (): Executor => activeTransaction.getStore() ?? db

/** Runs `work` in one transaction. A call made while one is already open joins it. */
export function runInTransaction<T>(work: () => Promise<T>): Promise<T> {
  if (activeTransaction.getStore()) return work()
  return db.transaction((tx) => activeTransaction.run(tx, work))
}
