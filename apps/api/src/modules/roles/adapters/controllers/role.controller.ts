import { Elysia, t } from 'elysia'
import { inject, injectable } from 'tsyringe'
import { requirePermission } from '../../../../domains/authorization'
import type { RoleEntity } from '../../../../domains/role.domain'
import { idParams, page } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import { CreateRoleUseCase } from '../../applications/usecases/create-role.usecase'
import { UpdateRoleUseCase } from '../../applications/usecases/update-role.usecase'
import { DeleteRoleUseCase } from '../../applications/usecases/delete-role.usecase'
import { ListRolesUseCase } from '../../applications/usecases/list-roles.usecase'
import { GetRoleUseCase } from '../../applications/usecases/get-role.usecase'
import { roleSchemas } from './schemas/role.schema'

// Mutations return the command result. User counts are supplied by a read use case.
const response = (role: RoleEntity, userCount: number) => ({ ...role.toSnapshot(), permissions: [...role.permissions], userCount })
@injectable()
export class RoleElysiaController {
  constructor(@inject(ListRolesUseCase) private readonly list: ListRolesUseCase,
    @inject(GetRoleUseCase) private readonly get: GetRoleUseCase,
    @inject(CreateRoleUseCase) private readonly create: CreateRoleUseCase,
    @inject(UpdateRoleUseCase) private readonly update: UpdateRoleUseCase,
    @inject(DeleteRoleUseCase) private readonly remove: DeleteRoleUseCase) {}
  getRoutes() {
    return new Elysia({ name: 'roles', prefix: '/roles', detail: { tags: ['Roles'] } }).use(auth)
      .get('/', async ({ query, user }) => {
        const result = await this.list.execute(query, user)
        return { ...result, items: result.items.map((role) => ({ ...role, permissions: [...role.permissions] })) }
      }, { auth: true, query: roleSchemas.listQuery, response: page(roleSchemas.role), detail: { summary: 'รายการบทบาท' } })
      .post('/', async ({ body, user }) => {
        requirePermission(user, 'roles.manage')
        return response(await this.create.execute(body), 0)
      }, { auth: true, body: roleSchemas.create, response: roleSchemas.role, detail: { summary: 'สร้างบทบาท' } })
      .patch('/:id', async ({ params, body, user }) => {
        requirePermission(user, 'roles.manage')
        const role = await this.update.execute(params.id, body)
        const read = await this.get.execute(role.id)
        return response(role, read.userCount)
      }, { auth: true, params: idParams, body: roleSchemas.update, response: roleSchemas.role, detail: { summary: 'แก้ไขบทบาท' } })
      .delete('/:id', async ({ params, user }) => {
        requirePermission(user, 'roles.manage')
        await this.remove.execute(params.id)
        return { ok: true }
      }, { auth: true, params: idParams, response: t.Object({ ok: t.Boolean() }), detail: { summary: 'ลบบทบาท' } })
  }
}
