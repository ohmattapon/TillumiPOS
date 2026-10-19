import { inject, injectable } from 'tsyringe'
import type { IFirstRunGuard } from '../../../setup/applications/ports/first-run-guard.port'
import { userRepositoryToken, type IUserRepository } from '../../applications/ports/user.repository'

/** Answers the setup module's question from the users' own memory store, so setup never reads it. */
@injectable()
export class MemoryFirstRunGuard implements IFirstRunGuard {
  constructor(@inject(userRepositoryToken) private readonly users: IUserRepository) {}

  async countUsers() {
    return (await this.users.findAll()).length
  }

  async lockAndCountUsers() {
    // No-op by design: a single process has no concurrent transactions to
    // serialize, so there is nothing to lock. This must stay a no-op only
    // here — the drizzle twin takes a real advisory lock instead.
    return this.countUsers()
  }
}
