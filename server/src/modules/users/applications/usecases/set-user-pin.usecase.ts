import { inject, injectable } from 'tsyringe'
import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { requirePermission, type Actor } from '../../../../domains/authorization'
import { DomainForbiddenError } from '../../../../domains/errors/domain-forbidden.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { assertValidPin } from '../../../../domains/pin.vo'
import { auditLogToken, type IAuditLog } from '../../../audit/applications/ports/audit-log.port'
import type { IPasswordHasher } from '../../../shared/ports/password-hasher.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { userRepositoryToken } from '../ports/user.repository'
import type { IUserRepository } from '../ports/user.repository'
import { setPinSchema } from '../schemas/user-schemas'

/** Command: a user manager sets or clears another user's quick-switch PIN. */
@injectable()
export class SetUserPinUseCase {
  constructor(
    @inject(userRepositoryToken) private readonly users: IUserRepository,
    @inject(TOKENS.PasswordHasher) private readonly hasher: IPasswordHasher,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(auditLogToken) private readonly audit: IAuditLog,
  ) { }

  async execute(targetId: number, input: unknown, actor: Actor & { id: number; displayName: string }) {
    requirePermission(actor, 'users.manage')
    const { pin } = setPinSchema.parse(input)
    if (pin !== null) assertValidPin(pin)

    return this.unitOfWork.run(async () => {
      const target = await this.users.findByIdForUpdate(targetId)
      if (!target) throw new DomainNotFoundError('ไม่พบผู้ใช้')
      // A manager must not be able to take over an owner's quick switch by choosing the owner's PIN.
      if (target.role === 'owner' && target.id !== actor.id)
        throw new DomainForbiddenError('PIN ของเจ้าของร้านตั้งได้เฉพาะเจ้าของเอง', 'OWNER_PIN_SELF_ONLY')

      await this.users.setPinHash(targetId, pin === null ? null : await this.hasher.hash(pin))
      await this.audit.record({ id: actor.id, name: actor.displayName }, target.branchId, buildAuditEntry({
        action: pin === null ? 'user.pin_cleared' : 'user.pin_set',
        entityType: 'user',
        entityId: String(targetId),
        summary: pin === null ? 'ลบ PIN ผู้ใช้' : 'ตั้ง PIN ผู้ใช้',
        before: { hasPin: target.hasPin },
        after: { hasPin: pin !== null },
      }))
      return (await this.users.findById(targetId)) ?? target
    })
  }
}
