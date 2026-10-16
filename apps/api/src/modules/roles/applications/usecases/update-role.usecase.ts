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
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork) {}
  async execute(input: unknown, changes: unknown) {
    const id = roleIdSchema.parse(input), dto = updateRoleSchema.parse(changes)
    return this.unitOfWork.run(async () => {
      const role = await this.roles.findByIdForUpdate(id)
      if (!role) throw new DomainNotFoundError('ไม่พบบทบาท', 'ROLE_NOT_FOUND')
      return this.roles.update(role.with(dto))
    })
  }
}
