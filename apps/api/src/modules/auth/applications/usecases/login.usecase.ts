import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { auditLogToken, type IAuditLog } from '../../../audit/applications/ports/audit-log.port'
import { inject, injectable } from 'tsyringe'
import { DomainUnauthorizedError } from '../../../../domains/errors/domain-unauthorized.error'
import { UserEntity } from '../../../../domains/user.domain'
import type { IPasswordHasher } from '../../../shared/ports/password-hasher.port'
import { TOKENS } from '../../../tokens'
import { userRepositoryToken } from '../../../users/applications/ports/user.repository'
import type { IUserRepository } from '../../../users/applications/ports/user.repository'
import { loginSchema } from '../schemas/auth-schemas'

/** The login form has no length limit, so what a failed attempt writes to the audit log is cut to this. */
const MAX_ATTEMPTED_NAME = 64

/** Command: checks credentials and records failed attempts. The HTTP adapter starts the session. */
@injectable()
export class LoginUseCase {
  constructor(
    @inject(userRepositoryToken) private readonly users: IUserRepository,
    @inject(TOKENS.PasswordHasher) private readonly hasher: IPasswordHasher,
    @inject(auditLogToken) private readonly audit: IAuditLog,
  ) { }

  async execute(input: unknown) {
    const dto = loginSchema.parse(input)

    const found = await this.users.findCredentialsByUsername(UserEntity.normalizeUsername(dto.username))
    const isValid = found?.user.isActive && (await this.hasher.verify(dto.password, found.passwordHash))
    // One message for every cause, so the response never reveals whether a username exists.
    if (!found || !isValid) {
      const attempted = dto.username.slice(0, MAX_ATTEMPTED_NAME)
      try {
        await this.audit.record({ id: null, name: attempted }, null, buildAuditEntry({
          action: 'auth.login_failed',
          entityType: 'auth',
          entityId: attempted,
          summary: 'เข้าสู่ระบบไม่สำเร็จ',
        }))
      } catch (error) { console.error('audit: login_failed not recorded', error) }
      throw new DomainUnauthorizedError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
    }

    return found.user
  }
}
