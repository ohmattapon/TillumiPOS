import { t } from 'elysia'

const fields = {
  name: t.String({ minLength: 1, maxLength: 100 }),
  sortOrder: t.Integer(),
  isActive: t.Boolean(),
}

export const CategoryModel = {
  category: t.Object({ id: t.Integer(), ...fields }),
  create: t.Object({ name: fields.name, sortOrder: t.Optional(fields.sortOrder) }),
  update: t.Partial(t.Object(fields)),
}

export type Category = typeof CategoryModel.category.static
export type CreateCategory = typeof CategoryModel.create.static
export type UpdateCategory = typeof CategoryModel.update.static
