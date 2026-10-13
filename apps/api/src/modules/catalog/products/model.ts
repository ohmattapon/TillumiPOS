import { t } from 'elysia'
import { satang } from '../../../shared/models'

const fields = {
  sku: t.String({ minLength: 1, maxLength: 64 }),
  barcode: t.Nullable(t.String({ minLength: 1, maxLength: 64 })),
  name: t.String({ minLength: 1, maxLength: 200 }),
  categoryId: t.Nullable(t.Integer()),
  priceSatang: satang(),
  costSatang: satang(),
  trackStock: t.Boolean(),
  isActive: t.Boolean(),
}

export const ProductModel = {
  product: t.Object({ id: t.Integer(), ...fields, stockQty: t.Integer(), imageUrl: t.Nullable(t.String()) }),
  create: t.Object({
    sku: fields.sku,
    name: fields.name,
    priceSatang: fields.priceSatang,
    barcode: t.Optional(fields.barcode),
    categoryId: t.Optional(fields.categoryId),
    costSatang: t.Optional(fields.costSatang),
    trackStock: t.Optional(fields.trackStock),
  }),
  // Stock is deliberately absent: it only changes through the inventory module.
  update: t.Partial(t.Object(fields)),
  image: t.Object({ file: t.File({ type: ['image/jpeg', 'image/png', 'image/webp'], maxSize: '5m' }) }),
  listQuery: t.Object({
    q: t.Optional(t.String()),
    categoryId: t.Optional(t.Numeric()),
    includeInactive: t.Optional(t.BooleanString()),
    limit: t.Optional(t.Numeric({ minimum: 1, maximum: 1000 })),
    offset: t.Optional(t.Numeric({ minimum: 0 })),
  }),
}

export type Product = typeof ProductModel.product.static
export type CreateProduct = typeof ProductModel.create.static
export type UpdateProduct = typeof ProductModel.update.static
export type ProductListQuery = typeof ProductModel.listQuery.static
