import { inject, injectable } from 'tsyringe'
import { UserEntity } from '../../../../domains/user.domain'
import type { IPasswordHasher } from '../../../shared/ports/password-hasher.port'
import { TOKENS } from '../../../tokens'
import { userRepositoryToken } from '../ports/user.repository'
import type { IUserRepository } from '../ports/user.repository'
import { createUserSchema } from '../schemas/user-schemas'

/** Command. */
@injectable()
export class CreateUserUseCase {
  constructor(
    @inject(userRepositoryToken) private readonly users: IUserRepository,
    @inject(TOKENS.PasswordHasher) private readonly hasher: IPasswordHasher,
  ) {}

  async execute(input: unknown) {
    const dto = createUserSchema.parse(input)

    const user = new UserEntity({
      id: 0,
      username: UserEntity.normalizeUsername(dto.username),
      displayName: dto.displayName,
      role: dto.role,
      isActive: true,
    })
    return this.users.create(user, await this.hasher.hash(dto.password))
  }
}
