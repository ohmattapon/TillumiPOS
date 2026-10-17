import { injectable } from 'tsyringe'
import { runInTransaction } from '../../../libs/transaction-context'
import type { IUnitOfWork } from '../ports/unit-of-work.port'

@injectable()
export class DrizzleUnitOfWork implements IUnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T> {
    return runInTransaction(work)
  }
}
