import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { auditLogToken, type IAuditLog } from '../../../audit/applications/ports/audit-log.port'
import { requirePermission, type Actor } from '../../../../domains/authorization'
import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { roleRepositoryToken, type IRoleRepository } from '../ports/role.repository'
import { roleUsageToken, type IRoleUsage } from '../ports/role-usage.port'
import { roleIdSchema } from '../schemas/role-schemas'
/** Command. */
@injectable()
export class DeleteRoleUseCase {
  constructor(@inject(roleRepositoryToken) private readonly roles: IRoleRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(roleUsageToken) private readonly usage: IRoleUsage,
    @inject(auditLogToken) private readonly audit: IAuditLog) { }
  async execute(input: unknown, actor: Actor & { id: number; displayName: string }) {
    const id = roleIdSchema.parse(input)
    requirePermission(actor, 'roles.manage')
    return this.unitOfWork.run(async () => {
      const role = await this.roles.findByIdForUpdate(id)
      if (!role) throw new DomainNotFoundError('ไม่พบบทบาท', 'ROLE_NOT_FOUND')
      if (role.isSystem) throw new DomainConflictError('บทบาทของระบบลบไม่ได้', 'ROLE_PROTECTED')
      if (await this.usage.countUsers(id)) throw new DomainConflictError('มีผู้ใช้ถือบทบาทนี้อยู่', 'ROLE_IN_USE')
      await this.roles.delete(id)
      await this.audit.record({ id: actor.id, name: actor.displayName }, null, buildAuditEntry({
        action: 'role.delete',
        entityType: 'role',
        entityId: String(id),
        summary: 'ลบบทบาท',
        before: role.toSnapshot(),
      }))
      return role
    })
  }
}
