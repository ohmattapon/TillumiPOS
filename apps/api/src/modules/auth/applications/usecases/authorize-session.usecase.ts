import { inject, injectable } from 'tsyringe'
import { DomainForbiddenError } from '../../../../domains/errors/domain-forbidden.error'
import { DomainUnauthorizedError } from '../../../../domains/errors/domain-unauthorized.error'
import type { UserRole } from '../../../../domains/user-role.vo'
import { userRepositoryToken } from '../../../users/applications/ports/user.repository'
import type { IUserRepository } from '../../../users/applications/ports/user.repository'

/** Query: resolves the user behind a session and checks their role. `true` allows any signed-in user. */
@injectable()
export class AuthorizeSessionUseCase {
  constructor(@inject(userRepositoryToken) private readonly users: IUserRepository) {}

  async execute(userId: number, roles: readonly UserRole[] | true) {
    // Looked up on every request, so deactivating a user takes effect immediately.
    const user = Number.isInteger(userId) ? await this.users.findActiveById(userId) : null
    if (!user) throw new DomainUnauthorizedError('กรุณาเข้าสู่ระบบ')
    if (roles !== true && !roles.includes(user.role)) throw new DomainForbiddenError('ไม่มีสิทธิ์ใช้งานส่วนนี้')

    return user
  }
}
