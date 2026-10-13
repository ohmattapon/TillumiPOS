import { Elysia, t } from 'elysia'
import { idParams } from '../../../shared/models'
import { auth } from '../../../shared/plugins/auth'
import { CategoryModel } from './model'
import { CategoriesService } from './service'

export const categories = new Elysia({ name: 'catalog.categories', prefix: '/categories' })
  .use(auth)
  .get('/', () => CategoriesService.list(), {
    auth: true,
    response: t.Array(CategoryModel.category),
    detail: { summary: 'รายการหมวดหมู่' },
  })
  .post('/', ({ body }) => CategoriesService.create(body), {
    auth: ['owner'],
    body: CategoryModel.create,
    response: CategoryModel.category,
    detail: { summary: 'เพิ่มหมวดหมู่' },
  })
  .patch('/:id', ({ params, body }) => CategoriesService.update(params.id, body), {
    auth: ['owner'],
    params: idParams,
    body: CategoryModel.update,
    response: CategoryModel.category,
    detail: { summary: 'แก้ไขหมวดหมู่' },
  })
