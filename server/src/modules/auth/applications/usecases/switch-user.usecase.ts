import { inject, injectable } from 'tsyringe'
import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainError } from '../../../../domains/errors/domain-error'
import type { UserEntity } from '../../../../domains/user.domain'
import { auditLogToken, type IAuditLog } from '../../../audit/applications/ports/audit-log.port'
import type { IPasswordHasher } from '../../../shared/ports/password-hasher.port'
import { TOKENS } from '../../../tokens'
import { userRepositoryToken } from '../../../users/applications/ports/user.repository'
import type { IUserRepository } from '../../../users/applications/ports/user.repository'
import { pinGuardToken, type IPinGuard } from '../ports/pin-guard.port'
import { switchUserSchema } from '../schemas/auth-schemas'

/**
 * Command: a signed-in till hands over to another user who proves it with their PIN. The HTTP adapter
 * starts the new session. Every failure is 400/409, never 401, so the till is not treated as signed out.
 */
@injectable()
export class SwitchUserUseCase {
  constructor(
    @inject(userRepositoryToken) private readonly users: IUserRepository,
    @inject(TOKENS.PasswordHasher) private readonly hasher: IPasswordHasher,
    @inject(pinGuardToken) private readonly guard: IPinGuard,
    @inject(auditLogToken) private readonly audit: IAuditLog,
  ) { }

  async execute(input: unknown, actor: { id: number; displayName: string }): Promise<UserEntity> {
    const { userId, pin } = switchUserSchema.parse(input)

    // Checked before the hash so a locked PIN cannot be tested at all.
    if (this.guard.check(userId) === 'locked')
      throw new DomainConflictError('ใส่ PIN ผิดหลายครั้ง กรุณารอ 15 นาทีแล้วลองใหม่', 'PIN_LOCKED')

    const target = await this.users.findActiveById(userId)
    const pinHash = await this.users.findPinHash(userId)
    if (!target || !pinHash) throw new DomainError('ผู้ใช้นี้ยังไม่ได้ตั้ง PIN', 'PIN_NOT_SET')

    const from = { id: actor.id, displayName: actor.displayName }
    const to = { id: target.id, displayName: target.displayName }
    if (!(await this.hasher.verify(pin, pinHash))) {
      this.guard.recordFailure(userId)
      // Outside any transaction, like a failed login: the audit write must never change the answer.
      try {
        await this.audit.record({ id: actor.id, name: actor.displayName }, target.branchId, buildAuditEntry({
          action: 'auth.switch_failed',
          entityType: 'user',
          entityId: String(target.id),
          summary: 'สลับผู้ใช้ไม่สำเร็จ PIN ไม่ถูกต้อง',
          before: from,
          after: to,
        }))
      } catch (error) { console.error('audit: switch_failed not recorded', error) }
      throw new DomainError('PIN ไม่ถูกต้อง', 'PIN_INVALID')
    }

    this.guard.recordSuccess(userId)
    await this.audit.record({ id: actor.id, name: actor.displayName }, target.branchId, buildAuditEntry({
      action: 'auth.switch',
      entityType: 'user',
      entityId: String(target.id),
      summary: 'สลับผู้ใช้ที่จุดขาย',
      before: from,
      after: to,
    }))
    return target
  }
}
