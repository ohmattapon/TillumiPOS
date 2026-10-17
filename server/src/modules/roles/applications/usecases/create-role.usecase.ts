import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { auditLogToken, type IAuditLog } from '../../../audit/applications/ports/audit-log.port'
import { requirePermission, type Actor } from '../../../../domains/authorization'
import { inject, injectable } from 'tsyringe'
import { RoleEntity } from '../../../../domains/role.domain'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { roleRepositoryToken, type IRoleRepository } from '../ports/role.repository'
import { createRoleSchema } from '../schemas/role-schemas'
/** Command. */
@injectable()
export class CreateRoleUseCase {
  constructor(@inject(roleRepositoryToken) private readonly roles: IRoleRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(auditLogToken) private readonly audit: IAuditLog) { }
  async execute(input: unknown, actor: Actor & { id: number; displayName: string }) {
    const dto = createRoleSchema.parse(input)
    const entity = new RoleEntity({ id: 0, ...dto, systemKey: null })
    requirePermission(actor, 'roles.manage')
    return this.unitOfWork.run(async () => {
      const result = await this.roles.create(entity)
      await this.audit.record({ id: actor.id, name: actor.displayName }, null, buildAuditEntry({
        action: 'role.create',
        entityType: 'role',
        entityId: String(result.id),
        summary: 'สร้างบทบาท',
        after: result.toSnapshot(),
      }))
      return result
    })
  }
}
