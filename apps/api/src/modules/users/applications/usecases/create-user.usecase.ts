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
    @inject(roleDirectoryToken) private readonly roles: IRoleDirectory,
  ) {}

  /** `defaultBranchId` is the branch the owner is working in, used when the request names none. */
  async execute(input: unknown, defaultBranchId: number) {
    const dto = createUserSchema.parse(input)

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
    return this.users.create(user, await this.hasher.hash(dto.password))
  }
}
