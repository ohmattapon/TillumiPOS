import { injectable } from 'tsyringe'
import type { IUnitOfWork } from '../../shared/ports/unit-of-work.port'

/**
 * No-database unit of work: memory writes apply immediately, so there is
 * nothing to commit or roll back. Runs the work directly in the caller.
 */
@injectable()
export class MemoryUnitOfWork implements IUnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T> {
    return work()
  }
}
