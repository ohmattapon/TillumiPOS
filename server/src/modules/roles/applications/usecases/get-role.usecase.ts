import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { roleRepositoryToken, type IRoleRepository, type RoleReadModel } from '../ports/role.repository'
import { roleUsageToken, type IRoleUsage } from '../ports/role-usage.port'
import { roleIdSchema } from '../schemas/role-schemas'
/** Query. */
@injectable()
export class GetRoleUseCase {
  constructor(@inject(roleRepositoryToken) private readonly roles: IRoleRepository,
    @inject(roleUsageToken) private readonly usage: IRoleUsage) {}
  async execute(input: unknown): Promise<RoleReadModel> {
    const id = roleIdSchema.parse(input)
    const role = await this.roles.findById(id)
    if (!role) throw new DomainNotFoundError('ไม่พบบทบาท', 'ROLE_NOT_FOUND')
    return { ...role.toSnapshot(), userCount: await this.usage.countUsers(id) }
  }
}
