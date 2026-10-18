import { t } from 'elysia'
import { satang } from '../../../../../libs/http-schemas'

const fields = {
  sku: t.String({ minLength: 1, maxLength: 64 }),
  barcode: t.Nullable(t.String({ minLength: 1, maxLength: 64 })),
  name: t.String({ minLength: 1, maxLength: 200 }),
  categoryId: t.Nullable(t.Integer()),
  productType: t.Union([t.Literal('normal'), t.Literal('cafe')]),
  priceSatang: satang(),
  costSatang: satang(),
  trackStock: t.Boolean(),
  isActive: t.Boolean(),
}

export const productSchemas = {
  product: t.Object({ id: t.Integer(), ...fields, stockQty: t.Integer(), imageUrl: t.Nullable(t.String()) }),
  create: t.Object({
    sku: fields.sku,
    name: fields.name,
    priceSatang: fields.priceSatang,
    barcode: t.Optional(fields.barcode),
    categoryId: t.Optional(fields.categoryId),
    productType: t.Optional(fields.productType),
    costSatang: t.Optional(fields.costSatang),
    trackStock: t.Optional(fields.trackStock),
  }),
  // Stock is deliberately absent: it only changes through the inventory module.
  update: t.Partial(t.Object(fields)),
  image: t.Object({ file: t.File({ type: ['image/jpeg', 'image/png', 'image/webp'], maxSize: '5m' }) }),
  listQuery: t.Object({
    q: t.Optional(t.String()),
    code: t.Optional(t.String({ minLength: 1, maxLength: 64 })),
    categoryId: t.Optional(t.Numeric()),
    productType: t.Optional(fields.productType),
    includeInactive: t.Optional(t.BooleanString()),
    isActive: t.Optional(t.BooleanString()),
    stockAtMost: t.Optional(t.Numeric()),
    sort: t.Optional(t.Union([t.Literal('name'), t.Literal('stock')])),
    limit: t.Optional(t.Numeric({ minimum: 1, maximum: 1000 })),
    offset: t.Optional(t.Numeric({ minimum: 0 })),
  }),
}

export type ProductResponse = typeof productSchemas.product.static
export type CreateProductBody = typeof productSchemas.create.static
