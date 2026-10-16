import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { auditLogToken, type IAuditLog } from '../../../audit/applications/ports/audit-log.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { UserEntity } from '../../../../domains/user.domain'
import { branchRepositoryToken } from '../../../branches/applications/ports/branch.repository'
import type { IBranchRepository } from '../../../branches/applications/ports/branch.repository'
import type { IPasswordHasher } from '../../../shared/ports/password-hasher.port'
import { TOKENS } from '../../../tokens'
import { roleDirectoryToken, type IRoleDirectory } from '../ports/role-directory.port'
import { resolveRole } from '../resolve-role'
import { userRepositoryToken } from '../ports/user.repository'
import type { IUserRepository } from '../ports/user.repository'
import { createUserSchema } from '../schemas/user-schemas'

/** Command. */
@injectable()
export class CreateUserUseCase {
  constructor(
    @inject(userRepositoryToken) private readonly users: IUserRepository,
    @inject(branchRepositoryToken) private readonly branches: IBranchRepository,
    @inject(TOKENS.PasswordHasher) private readonly hasher: IPasswordHasher,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(roleDirectoryToken) private readonly roles: IRoleDirectory,
    @inject(auditLogToken) private readonly audit: IAuditLog,
  ) { }

  /** `defaultBranchId` is the branch the owner is working in, used when the request names none. */
  async execute(input: unknown, defaultBranchId: number, actor: { id: number | null; displayName: string }) {
    const dto = createUserSchema.parse(input)

    return this.unitOfWork.run(async () => {
      const branchId = dto.branchId ?? defaultBranchId
      const branch = await this.branches.findById(branchId)
      if (!branch) throw new DomainNotFoundError('ไม่พบสาขา', 'BRANCH_NOT_FOUND')
      if (!branch.isActive) throw new DomainConflictError('สาขานี้ปิดใช้งานแล้ว', 'BRANCH_INACTIVE')

      const role = await resolveRole(this.roles, dto)
      const user = new UserEntity({
        id: 0,
        username: UserEntity.normalizeUsername(dto.username),
        displayName: dto.displayName,
        role: role.systemKey === 'owner' ? 'owner' : 'cashier',
        roleId: role.id,
        branchId,
        isActive: true,
      })
      const result = await this.users.create(user, await this.hasher.hash(dto.password))
      await this.audit.record({ id: actor.id, name: actor.displayName }, branchId, buildAuditEntry({
        action: 'user.create',
        entityType: 'user',
        entityId: String(result.id),
        summary: 'สร้างผู้ใช้',
        after: { displayName: result.displayName, roleId: result.roleId, branchId: result.branchId, isActive: result.isActive },
      }))
      return result
    })
  }
}
