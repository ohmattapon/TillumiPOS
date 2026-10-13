import { inject, injectable } from 'tsyringe'
import { userRepositoryToken } from '../ports/user.repository'
import type { IUserRepository } from '../ports/user.repository'

/** Query. */
@injectable()
export class ListUsersUseCase {
  constructor(@inject(userRepositoryToken) private readonly users: IUserRepository) {}

  execute() {
    return this.users.findAll()
  }
}
