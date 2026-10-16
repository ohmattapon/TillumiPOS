import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainForbiddenError } from '../../../../domains/errors/domain-forbidden.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { UserEntity } from '../../../../domains/user.domain'
import { branchRepositoryToken } from '../../../branches/applications/ports/branch.repository'
import type { IBranchRepository } from '../../../branches/applications/ports/branch.repository'
import { shopSettingsRepositoryToken } from '../../../settings/applications/ports/shop-settings.repository'
import type { IShopSettingsRepository } from '../../../settings/applications/ports/shop-settings.repository'
import type { IPasswordHasher } from '../../../shared/ports/password-hasher.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { roleDirectoryToken, type IRoleDirectory } from '../../../users/applications/ports/role-directory.port'
import { userRepositoryToken } from '../../../users/applications/ports/user.repository'
import type { IUserRepository } from '../../../users/applications/ports/user.repository'
import { firstRunGuardToken } from '../ports/first-run-guard.port'
import type { IFirstRunGuard } from '../ports/first-run-guard.port'
import { setupCodeToken } from '../ports/setup-code.port'
import type { ISetupCode } from '../ports/setup-code.port'
import { completeSetupSchema } from '../schemas/setup-schemas'

/**
 * Command: makes the first owner and names the shop. Works once: it is refused as soon as anyone has an
 * account, and until then only with the code the server printed in its log.
 */
@injectable()
export class CompleteSetupUseCase {
  constructor(
    @inject(firstRunGuardToken) private readonly guard: IFirstRunGuard,
    @inject(setupCodeToken) private readonly code: ISetupCode,
    @inject(userRepositoryToken) private readonly users: IUserRepository,
    @inject(branchRepositoryToken) private readonly branches: IBranchRepository,
    @inject(shopSettingsRepositoryToken) private readonly settings: IShopSettingsRepository,
    @inject(TOKENS.PasswordHasher) private readonly hasher: IPasswordHasher,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(roleDirectoryToken) private readonly roles: IRoleDirectory,
  ) {}

  async execute(input: unknown): Promise<UserEntity> {
    const dto = completeSetupSchema.parse(input)

    const owner = await this.unitOfWork.run(async () => {
      // The lock comes first: of two setups at the same moment, the second sees the first one's owner.
      if ((await this.guard.lockAndCountUsers()) > 0)
        throw new DomainConflictError('ตั้งค่าร้านครั้งแรกเสร็จไปแล้ว', 'SETUP_DONE')

      const check = this.code.verify(dto.setupCode)
      if (check === 'locked')
        throw new DomainForbiddenError('กรอกรหัสตั้งค่าผิดหลายครั้ง กรุณารอ 15 นาทีแล้วลองใหม่', 'SETUP_LOCKED')
      if (check !== 'accepted')
        throw new DomainForbiddenError('รหัสตั้งค่าไม่ถูกต้อง ดูรหัสได้จาก log ของระบบ', 'SETUP_CODE_INVALID')

      const [branch] = await this.branches.findAll()
      if (!branch) throw new DomainNotFoundError('ไม่พบสาขา', 'BRANCH_NOT_FOUND')
      await this.branches.update(branch.with({ name: dto.branchName }))
      await this.settings.save((await this.settings.getForUpdate()).with({ shopName: dto.shopName }))

      const ownerRole = await this.roles.findBySystemKey('owner')
      return this.users.create(
        new UserEntity({
          id: 0,
          username: UserEntity.normalizeUsername(dto.username),
          displayName: dto.displayName,
          role: 'owner',
          roleId: ownerRole.id,
          branchId: branch.id,
          isActive: true,
        }),
        await this.hasher.hash(dto.password),
      )
    })

    // Only after the owner is committed: a rolled back setup keeps its code to try again.
    this.code.retire()
    return owner
  }
}
