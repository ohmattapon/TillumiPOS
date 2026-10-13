import { Elysia, t } from 'elysia'
import { inject, injectable } from 'tsyringe'
import type { UserEntity } from '../../../../domains/user.domain'
import { idParams } from '../../../../shared/models'
import { auth } from '../../../auth.plugin'
import { CreateUserUseCase } from '../../applications/usecases/create-user.usecase'
import { ListUsersUseCase } from '../../applications/usecases/list-users.usecase'
import { UpdateUserUseCase } from '../../applications/usecases/update-user.usecase'
import { userSchemas, type UserResponse } from './schemas/user.schema'

const toResponse = (user: UserEntity): UserResponse => user.toSnapshot()

@injectable()
export class UserElysiaController {
  constructor(
    @inject(ListUsersUseCase) private readonly listUsers: ListUsersUseCase,
    @inject(CreateUserUseCase) private readonly createUser: CreateUserUseCase,
    @inject(UpdateUserUseCase) private readonly updateUser: UpdateUserUseCase,
  ) {}

  getRoutes() {
    return new Elysia({ name: 'users', prefix: '/users', detail: { tags: ['Users'] } })
      .use(auth)
      .guard({ auth: ['owner'] })
      .get('/', async () => (await this.listUsers.execute()).map(toResponse), {
        response: t.Array(userSchemas.user),
        detail: { summary: 'รายชื่อผู้ใช้ทั้งหมด' },
      })
      .post('/', async ({ body }) => toResponse(await this.createUser.execute(body)), {
        body: userSchemas.create,
        response: userSchemas.user,
        detail: { summary: 'เพิ่มผู้ใช้' },
      })
      .patch('/:id', async ({ params, body }) => toResponse(await this.updateUser.execute(params.id, body)), {
        params: idParams,
        body: userSchemas.update,
        response: userSchemas.user,
        detail: { summary: 'แก้ไขผู้ใช้ เปลี่ยนรหัสผ่าน หรือปิดการใช้งาน' },
      })
  }
}
