import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { IPasswordHasher } from '../../../shared/ports/password-hasher.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { userRepositoryToken } from '../ports/user.repository'
import type { IUserRepository } from '../ports/user.repository'
import { updateUserSchema } from '../schemas/user-schemas'

/** Command. */
@injectable()
export class UpdateUserUseCase {
  constructor(
    @inject(userRepositoryToken) private readonly users: IUserRepository,
    @inject(TOKENS.PasswordHasher) private readonly hasher: IPasswordHasher,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
  ) {}

  async execute(id: number, input: unknown) {
    const { password, ...changes } = updateUserSchema.parse(input)

    // The owner count and the write must see the same data, or two requests could each remove "the other" owner.
    return this.unitOfWork.run(async () => {
      const existing = await this.users.findByIdForUpdate(id)
      if (!existing) throw new DomainNotFoundError('ไม่พบผู้ใช้')

      if (existing.wouldStopBeingActiveOwner(changes) && (await this.users.countActiveOwners()) <= 1)
        throw new DomainConflictError('ต้องมีเจ้าของร้านที่ใช้งานได้อย่างน้อย 1 คน', 'LAST_OWNER')

      return this.users.update(existing.with(changes), password ? await this.hasher.hash(password) : undefined)
    })
  }
}
