import { auditChanges } from '../../../../domains/audit-changes'
import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { auditLogToken, type IAuditLog } from '../../../audit/applications/ports/audit-log.port'
import { requirePermission, type Actor } from '../../../../domains/authorization'
import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { roleRepositoryToken, type IRoleRepository } from '../ports/role.repository'
import { roleIdSchema, updateRoleSchema } from '../schemas/role-schemas'
/** Command. */
@injectable()
export class UpdateRoleUseCase {
  constructor(@inject(roleRepositoryToken) private readonly roles: IRoleRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(auditLogToken) private readonly audit: IAuditLog) { }
  async execute(input: unknown, changes: unknown, actor: Actor & { id: number; displayName: string }) {
    const id = roleIdSchema.parse(input), dto = updateRoleSchema.parse(changes)
    requirePermission(actor, 'roles.manage')
    return this.unitOfWork.run(async () => {
      const role = await this.roles.findByIdForUpdate(id)
      if (!role) throw new DomainNotFoundError('ไม่พบบทบาท', 'ROLE_NOT_FOUND')
      const result = await this.roles.update(role.with(dto))
      const delta = auditChanges(role, result, ['name', 'permissions'])
      if (delta.changed) await this.audit.record({ id: actor.id, name: actor.displayName }, null, buildAuditEntry({
        action: 'role.update',
        entityType: 'role',
        entityId: String(id),
        summary: 'แก้ไขบทบาท',
        before: delta.before,
        after: delta.after,
      }))
      return result
    })
  }
}
