import { inject, injectable } from 'tsyringe'
import { canDo, requirePermission, type Actor } from '../../../../domains/authorization'
import { roleRepositoryToken, type IRoleRepository, type RoleReadModel } from '../ports/role.repository'
import { roleUsageToken, type IRoleUsage } from '../ports/role-usage.port'
import { listRolesSchema } from '../schemas/role-schemas'
/** Query. */
@injectable()
export class ListRolesUseCase {
  constructor(@inject(roleRepositoryToken) private readonly roles: IRoleRepository,
    @inject(roleUsageToken) private readonly usage: IRoleUsage) {}
  async execute(input: unknown, actor: Actor) {
    const query = listRolesSchema.parse(input)
    if (!canDo(actor, 'users.manage')) requirePermission(actor, 'roles.manage')
    const result = await this.roles.findAll(query)
    const items: RoleReadModel[] = await Promise.all(result.items.map(async (role) => ({ ...role.toSnapshot(), userCount: await this.usage.countUsers(role.id) })))
    return { items, total: result.total }
  }
}
