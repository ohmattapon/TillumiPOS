import { t } from 'elysia'
import { satang } from '../../../../../libs/http-schemas'

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

const packFields = {
  barcode: t.String({ minLength: 1, maxLength: 64 }),
  size: t.Integer(),
  priceSatang: t.Nullable(satang()),
}
const pack = t.Object({ id: t.Integer(), ...packFields, isActive: t.Boolean() })
// Range rules (size, price) are checked by the domain, not here.
const packInput = t.Object({ id: t.Optional(t.Integer()), ...packFields, isActive: t.Optional(t.Boolean()) })

export const productSchemas = {
  product: t.Object({ id: t.Integer(), ...fields, stockQty: t.Integer(), imageUrl: t.Nullable(t.String()), packs: t.Array(pack) }),
  create: t.Object({
    sku: fields.sku,
    name: fields.name,
    priceSatang: fields.priceSatang,
    barcode: t.Optional(fields.barcode),
    categoryId: t.Optional(fields.categoryId),
    costSatang: t.Optional(fields.costSatang),
    trackStock: t.Optional(fields.trackStock),
    packs: t.Optional(t.Array(packInput)),
  }),
  // Stock is deliberately absent: it only changes through the inventory module.
  update: t.Partial(t.Object({ ...fields, packs: t.Array(packInput) })),
  image: t.Object({ file: t.File({ type: ['image/jpeg', 'image/png', 'image/webp'], maxSize: '5m' }) }),
  listQuery: t.Object({
    q: t.Optional(t.String()),
    code: t.Optional(t.String({ minLength: 1, maxLength: 64 })),
    categoryId: t.Optional(t.Numeric()),
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
