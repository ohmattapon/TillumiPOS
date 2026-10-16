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
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork) {}
  async execute(input: unknown) {
    const dto = createRoleSchema.parse(input)
    const entity = new RoleEntity({ id: 0, ...dto, systemKey: null })
    return this.unitOfWork.run(() => this.roles.create(entity))
  }
}
