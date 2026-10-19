import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { auditLogToken, type IAuditLog } from '../../../audit/applications/ports/audit-log.port'
import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainUnauthorizedError } from '../../../../domains/errors/domain-unauthorized.error'
import { UserEntity } from '../../../../domains/user.domain'
import type { IPasswordHasher } from '../../../shared/ports/password-hasher.port'
import { TOKENS } from '../../../tokens'
import { userRepositoryToken } from '../../../users/applications/ports/user.repository'
import type { IUserRepository } from '../../../users/applications/ports/user.repository'
import { loginSchema } from '../schemas/auth-schemas'
import { loginAttemptGuardToken, type ILoginAttemptGuard } from '../ports/login-attempt-guard.port'

/** The login form has no length limit, so what a failed attempt writes to the audit log is cut to this. */
const MAX_ATTEMPTED_NAME = 64

/** Command: checks credentials and records failed attempts. The HTTP adapter starts the session. */
@injectable()
export class LoginUseCase {
  constructor(
    @inject(userRepositoryToken) private readonly users: IUserRepository,
    @inject(TOKENS.PasswordHasher) private readonly hasher: IPasswordHasher,
    @inject(auditLogToken) private readonly audit: IAuditLog,
    @inject(loginAttemptGuardToken) private readonly guard: ILoginAttemptGuard,
  ) { }

  async execute(input: unknown) {
    const dto = loginSchema.parse(input)
    const name = UserEntity.normalizeUsername(dto.username)

    const found = await this.users.findCredentialsByUsername(name)
    // One message for every cause, so the response never reveals whether a username exists.
    // Unknown and deactivated accounts count no attempt: without an account there is nothing to
    // break into, and skipping them keeps usernames unguessable through the lock.
    if (!found || !found.user.isActive) {
      await this.recordFailure(dto.username)
      throw new DomainUnauthorizedError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
    }
    // Reserved synchronously before the hash check is awaited, so parallel requests cannot all
    // pass before a failure is counted. A locked name skips the hashing work entirely.
    if (this.guard.begin(name) === 'locked')
      throw new DomainConflictError('ลองผิดเกิน 5 ครั้ง รอ 15 นาทีแล้วลองใหม่', 'LOGIN_LOCKED')

    if (!(await this.hasher.verify(dto.password, found.passwordHash))) {
      await this.recordFailure(dto.username)
      throw new DomainUnauthorizedError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
    }

    this.guard.recordSuccess(name)
    return found.user
  }

  private async recordFailure(username: string) {
    const attempted = username.slice(0, MAX_ATTEMPTED_NAME)
    try {
      await this.audit.record({ id: null, name: attempted }, null, buildAuditEntry({
        action: 'auth.login_failed',
        entityType: 'auth',
        entityId: attempted,
        summary: 'เข้าสู่ระบบไม่สำเร็จ',
      }))
    } catch (error) { console.error('audit: login_failed not recorded', error) }
  }
}
