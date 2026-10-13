import { inject, injectable } from 'tsyringe'
import { DomainUnauthorizedError } from '../../../../domains/errors/domain-unauthorized.error'
import { UserEntity } from '../../../../domains/user.domain'
import type { IPasswordHasher } from '../../../shared/ports/password-hasher.port'
import { TOKENS } from '../../../tokens'
import { userRepositoryToken } from '../../../users/applications/ports/user.repository'
import type { IUserRepository } from '../../../users/applications/ports/user.repository'
import { loginSchema } from '../schemas/auth-schemas'

/** Query: checks credentials and returns who they belong to. Starting the session is the HTTP adapter's job. */
@injectable()
export class LoginUseCase {
  constructor(
    @inject(userRepositoryToken) private readonly users: IUserRepository,
    @inject(TOKENS.PasswordHasher) private readonly hasher: IPasswordHasher,
  ) {}

  async execute(input: unknown) {
    const dto = loginSchema.parse(input)

    const found = await this.users.findCredentialsByUsername(UserEntity.normalizeUsername(dto.username))
    const isValid = found?.user.isActive && (await this.hasher.verify(dto.password, found.passwordHash))
    // One message for every cause, so the response never reveals whether a username exists.
    if (!found || !isValid) throw new DomainUnauthorizedError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')

    return found.user
  }
}
