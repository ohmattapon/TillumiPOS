import { t } from 'elysia'

const fields = {
  sortOrder: t.Integer({ minimum: 0 }),
  isActive: t.Boolean(),
}

export const slideSchemas = {
  slide: t.Object({ id: t.Integer(), imageUrl: t.Nullable(t.String()), sortOrder: fields.sortOrder, isActive: fields.isActive }),
  upload: t.Object({ file: t.File({ type: ['image/jpeg', 'image/png', 'image/webp'], maxSize: '5m' }) }),
  update: t.Partial(t.Object(fields)),
}

export type SlideResponse = typeof slideSchemas.slide.static
