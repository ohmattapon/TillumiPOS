import { inject, injectable } from 'tsyringe'
import type { IRoleUsage } from '../../../roles/applications/ports/role-usage.port'
import { userRepositoryToken, type IUserRepository } from '../../applications/ports/user.repository'

/** Counts every user holding a role, including inactive users, from the users' own memory store. */
@injectable()
export class MemoryRoleUsage implements IRoleUsage {
  constructor(@inject(userRepositoryToken) private readonly users: IUserRepository) {}

  async countUsers(roleId: number) {
    return (await this.users.findAll()).filter((user) => user.roleId === roleId).length
  }
}
