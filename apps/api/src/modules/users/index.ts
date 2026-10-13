import { Elysia, t } from 'elysia'
import { idParams } from '../../shared/models'
import { auth } from '../../shared/plugins/auth'
import { UserModel } from './model'
import { UsersService } from './service'

export const users = new Elysia({ name: 'users', prefix: '/users', detail: { tags: ['Users'] } })
  .use(auth)
  .guard({ auth: ['owner'] })
  .get('/', () => UsersService.list(), {
    response: t.Array(UserModel.user),
    detail: { summary: 'รายชื่อผู้ใช้ทั้งหมด' },
  })
  .post('/', ({ body }) => UsersService.create(body), {
    body: UserModel.create,
    response: UserModel.user,
    detail: { summary: 'เพิ่มผู้ใช้' },
  })
  .patch('/:id', ({ params, body }) => UsersService.update(params.id, body), {
    params: idParams,
    body: UserModel.update,
    response: UserModel.user,
    detail: { summary: 'แก้ไขผู้ใช้ เปลี่ยนรหัสผ่าน หรือปิดการใช้งาน' },
  })
