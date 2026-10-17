import { inject, injectable } from 'tsyringe'
import { canDo, requirePermission } from '../../../../domains/authorization'
import { PERMISSIONS, type Permission } from '../../../../domains/permission.vo'
import { DomainUnauthorizedError } from '../../../../domains/errors/domain-unauthorized.error'
import { sessionAuthorizationReaderToken, type ISessionAuthorizationReader } from '../ports/session-authorization-reader.port'

/** Query: reads the current active user and grants together on every request. */
@injectable()
export class AuthorizeSessionUseCase {
  constructor(@inject(sessionAuthorizationReaderToken) private readonly sessions: ISessionAuthorizationReader) {}

  async execute(userId: number, requirement: true | { can: Permission }) {
    const session = Number.isInteger(userId) ? await this.sessions.findActiveById(userId) : null
    if (!session) throw new DomainUnauthorizedError('กรุณาเข้าสู่ระบบ')
    const { user, roleName } = session
    const actor = { role: user.role, permissions: session.permissions }
    const permissions = PERMISSIONS.filter((permission) => canDo(actor, permission))
    if (requirement !== true) requirePermission({ role: user.role, permissions }, requirement.can)
    return { user, roleName, permissions }
  }
}
