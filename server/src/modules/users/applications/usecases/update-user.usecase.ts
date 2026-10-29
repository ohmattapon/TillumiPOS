import { auditChanges } from '../../../../domains/audit-changes'
import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { auditLogToken, type IAuditLog } from '../../../audit/applications/ports/audit-log.port'
import { inject, injectable } from 'tsyringe'
import type { UserEntity } from '../../../../domains/user.domain'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { branchRepositoryToken } from '../../../branches/applications/ports/branch.repository'
import type { IBranchRepository } from '../../../branches/applications/ports/branch.repository'
import type { IPasswordHasher } from '../../../shared/ports/password-hasher.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { roleDirectoryToken, type IRoleDirectory } from '../ports/role-directory.port'
import { resolveRole } from '../resolve-role'
import { userRepositoryToken } from '../ports/user.repository'
import type { IUserRepository } from '../ports/user.repository'
import { updateUserSchema } from '../schemas/user-schemas'

/** Command. */
@injectable()
export class UpdateUserUseCase {
  constructor(
    @inject(userRepositoryToken) private readonly users: IUserRepository,
    @inject(branchRepositoryToken) private readonly branches: IBranchRepository,
    @inject(TOKENS.PasswordHasher) private readonly hasher: IPasswordHasher,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(roleDirectoryToken) private readonly roles: IRoleDirectory,
    @inject(auditLogToken) private readonly audit: IAuditLog,
  ) { }

  async execute(id: number, input: unknown, actor: { id: number; displayName: string }) {
    const { password, ...changes } = updateUserSchema.parse(input)

    // The owner count and the write must see the same data, or two requests could each remove "the other" owner.
    return this.unitOfWork.run(async () => {
      await this.users.lockOwnerChangesForUpdate()
      const existing = await this.users.findByIdForUpdate(id)
      if (!existing) throw new DomainNotFoundError('ไม่พบผู้ใช้')

      if (changes.branchId !== undefined && changes.branchId !== existing.branchId) await this.assertBranchUsable(changes.branchId)

      if (changes.roleId !== undefined || changes.role !== undefined) {
        const role = await resolveRole(this.roles, changes)
        changes.roleId = role.id
        changes.role = role.systemKey === 'owner' ? 'owner' : 'cashier'
      }

      if (existing.wouldStopBeingActiveOwner(changes) && (await this.users.countActiveOwners()) <= 1)
        throw new DomainConflictError('ต้องมีเจ้าของร้านที่ใช้งานได้อย่างน้อย 1 คน', 'LAST_OWNER')

      const result = await this.users.update(existing.with(changes), password ? await this.hasher.hash(password) : undefined)
      await this.recordUpdate(existing, result, Boolean(password), actor)

      // An owner's PIN is set only by that owner (OWNER_PIN_SELF_ONLY), so one chosen by whoever promoted them goes.
      const becameOwner = existing.role !== 'owner' && result.role === 'owner'
      if (becameOwner && existing.hasPin && actor.id !== id) {
        await this.clearPin(id, result.branchId, actor)
        return (await this.users.findById(id)) ?? result
      }
      return result
    })
  }

  private async assertBranchUsable(branchId: number): Promise<void> {
    const branch = await this.branches.findById(branchId)
    if (!branch) throw new DomainNotFoundError('ไม่พบสาขา', 'BRANCH_NOT_FOUND')
    if (!branch.isActive) throw new DomainConflictError('สาขานี้ปิดใช้งานแล้ว', 'BRANCH_INACTIVE')
  }

  private async recordUpdate(
    existing: UserEntity,
    result: UserEntity,
    passwordChanged: boolean,
    actor: { id: number; displayName: string },
  ): Promise<void> {
    const delta = auditChanges(existing, result, ['displayName', 'roleId', 'branchId', 'isActive'])
    if (passwordChanged) delta.after.passwordChanged = true
    if (!delta.changed && !passwordChanged) return
    await this.audit.record({ id: actor.id, name: actor.displayName }, result.branchId, buildAuditEntry({
      action: 'user.update',
      entityType: 'user',
      entityId: String(existing.id),
      summary: 'แก้ไขผู้ใช้',
      before: delta.before,
      after: delta.after,
    }))
  }

  private async clearPin(id: number, branchId: number, actor: { id: number; displayName: string }): Promise<void> {
    await this.users.setPinHash(id, null)
    await this.audit.record({ id: actor.id, name: actor.displayName }, branchId, buildAuditEntry({
      action: 'user.pin_cleared',
      entityType: 'user',
      entityId: String(id),
      summary: 'ลบ PIN เมื่อผู้ใช้กลายเป็นเจ้าของร้าน',
      before: { hasPin: true },
      after: { hasPin: false },
    }))
  }
}
