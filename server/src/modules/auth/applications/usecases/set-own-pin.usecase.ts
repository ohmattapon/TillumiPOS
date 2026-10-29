import { inject, injectable } from 'tsyringe'
import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { DomainError } from '../../../../domains/errors/domain-error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { assertValidPin } from '../../../../domains/pin.vo'
import { auditLogToken, type IAuditLog } from '../../../audit/applications/ports/audit-log.port'
import type { IPasswordHasher } from '../../../shared/ports/password-hasher.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { userRepositoryToken } from '../../../users/applications/ports/user.repository'
import type { IUserRepository } from '../../../users/applications/ports/user.repository'
import { setOwnPinSchema } from '../schemas/auth-schemas'

/** Command: a signed-in user sets or clears their own quick-switch PIN, proving it with their password. */
@injectable()
export class SetOwnPinUseCase {
  constructor(
    @inject(userRepositoryToken) private readonly users: IUserRepository,
    @inject(TOKENS.PasswordHasher) private readonly hasher: IPasswordHasher,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(auditLogToken) private readonly audit: IAuditLog,
  ) { }

  async execute(input: unknown, actor: { id: number; displayName: string }) {
    const { currentPassword, pin } = setOwnPinSchema.parse(input)
    if (pin !== null) assertValidPin(pin)

    await this.assertCurrentPassword(currentPassword, actor)

    return this.unitOfWork.run(async () => {
      const before = await this.users.findById(actor.id)
      if (!before) throw new DomainNotFoundError('ไม่พบผู้ใช้')
      await this.users.setPinHash(actor.id, pin === null ? null : await this.hasher.hash(pin))
      await this.audit.record({ id: actor.id, name: actor.displayName }, before.branchId, buildAuditEntry({
        action: pin === null ? 'user.pin_cleared' : 'user.pin_set',
        entityType: 'user',
        entityId: String(actor.id),
        summary: pin === null ? 'ลบ PIN ของตนเอง' : 'ตั้ง PIN ของตนเอง',
        before: { hasPin: before.hasPin },
        after: { hasPin: pin !== null },
      }))
      return (await this.users.findById(actor.id)) ?? before
    })
  }

  /** Checked before the unit of work, so the failure can be audited without being rolled back with it. */
  private async assertCurrentPassword(currentPassword: string, actor: { id: number; displayName: string }): Promise<void> {
    const passwordHash = await this.users.findPasswordHashById(actor.id)
    if (passwordHash && (await this.hasher.verify(currentPassword, passwordHash))) return

    // Outside any transaction, like a failed login: the audit write must never change the answer.
    try {
      await this.audit.record({ id: actor.id, name: actor.displayName }, null, buildAuditEntry({
        action: 'auth.pin_password_failed',
        entityType: 'user',
        entityId: String(actor.id),
        summary: 'ตั้ง PIN ของตนเองไม่สำเร็จ รหัสผ่านไม่ถูกต้อง',
      }))
    } catch (error) { console.error('audit: pin_password_failed not recorded', error) }
    // 400, not 401: a 401 would make the web treat the till as signed out.
    throw new DomainError('รหัสผ่านปัจจุบันไม่ถูกต้อง', 'INVALID_PASSWORD')
  }
}
