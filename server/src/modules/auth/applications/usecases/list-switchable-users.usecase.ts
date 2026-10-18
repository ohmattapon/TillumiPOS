import { inject, injectable } from 'tsyringe'
import { userRepositoryToken } from '../../../users/applications/ports/user.repository'
import type { IUserRepository } from '../../../users/applications/ports/user.repository'

/** Query: who can take over the till — active users with a PIN, by display name. Only id and name leave. */
@injectable()
export class ListSwitchableUsersUseCase {
  constructor(@inject(userRepositoryToken) private readonly users: IUserRepository) { }

  execute(): Promise<{ id: number; displayName: string }[]> {
    return this.users.findSwitchable()
  }
}
