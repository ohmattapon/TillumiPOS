import { inject, injectable } from 'tsyringe'
import { firstRunGuardToken } from '../ports/first-run-guard.port'
import type { IFirstRunGuard } from '../ports/first-run-guard.port'

/** Query: whether the shop still has to be set up, which is when nobody has an account yet. */
@injectable()
export class GetSetupStatusUseCase {
  constructor(@inject(firstRunGuardToken) private readonly guard: IFirstRunGuard) {}

  async execute() {
    return { needsSetup: (await this.guard.countUsers()) === 0 }
  }
}
