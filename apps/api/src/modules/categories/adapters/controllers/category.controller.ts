import { Elysia, t } from 'elysia'
import { inject, injectable } from 'tsyringe'
import type { CategoryEntity } from '../../../../domains/category.domain'
import { idParams } from '../../../../shared/models'
import { auth } from '../../../../shared/plugins/auth'
import { CreateCategoryUseCase } from '../../applications/usecases/create-category.usecase'
import { ListCategoriesUseCase } from '../../applications/usecases/list-categories.usecase'
import { UpdateCategoryUseCase } from '../../applications/usecases/update-category.usecase'
import { categorySchemas, type CategoryResponse } from './schemas/category.schema'

// Entities never leave the API as-is: the response shape is a contract of its own.
const toResponse = (category: CategoryEntity): CategoryResponse => category.toSnapshot()

@injectable()
export class CategoryElysiaController {
  constructor(
    @inject(ListCategoriesUseCase) private readonly listCategories: ListCategoriesUseCase,
    @inject(CreateCategoryUseCase) private readonly createCategory: CreateCategoryUseCase,
    @inject(UpdateCategoryUseCase) private readonly updateCategory: UpdateCategoryUseCase,
  ) {}

  getRoutes() {
    return new Elysia({ name: 'catalog.categories', prefix: '/categories' })
      .use(auth)
      .get('/', async () => (await this.listCategories.execute()).map(toResponse), {
        auth: true,
        response: t.Array(categorySchemas.category),
        detail: { summary: 'รายการหมวดหมู่' },
      })
      .post('/', async ({ body }) => toResponse(await this.createCategory.execute(body)), {
        auth: ['owner'],
        body: categorySchemas.create,
        response: categorySchemas.category,
        detail: { summary: 'เพิ่มหมวดหมู่' },
      })
      .patch('/:id', async ({ params, body }) => toResponse(await this.updateCategory.execute(params.id, body)), {
        auth: ['owner'],
        params: idParams,
        body: categorySchemas.update,
        response: categorySchemas.category,
        detail: { summary: 'แก้ไขหมวดหมู่' },
      })
  }
}
