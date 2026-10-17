import { z } from 'zod'

const fields = {
  sku: z.string().min(1).max(64),
  barcode: z.string().min(1).max(64).nullable(),
  name: z.string().min(1).max(200),
  categoryId: z.number().int().nullable(),
  priceSatang: z.number().int().min(0),
  costSatang: z.number().int().min(0),
  trackStock: z.boolean(),
  isActive: z.boolean(),
}

// Range rules (size, price, barcode length) live in the domain; only the shape and the count bound are checked here.
const pack = z.object({
  id: z.number().int().positive().optional(),
  barcode: z.string().min(1).max(64),
  size: z.number().int(),
  priceSatang: z.number().int().nullable(),
  isActive: z.boolean().optional(),
})
const packs = z.array(pack).max(10)

// z.object() drops unknown keys, so stock, image and id can never be set through these.
export const createProductSchema = z.object({
  sku: fields.sku,
  name: fields.name,
  priceSatang: fields.priceSatang,
  barcode: fields.barcode.optional(),
  categoryId: fields.categoryId.optional(),
  costSatang: fields.costSatang.optional(),
  trackStock: fields.trackStock.optional(),
  packs: packs.optional(),
})

export const updateProductSchema = z.object({ ...fields, packs }).partial()

export const listProductsSchema = z.object({
  q: z.string().optional(),
  code: z.string().min(1).max(64).optional(),
  categoryId: z.number().int().optional(),
  includeInactive: z.boolean().optional(),
  isActive: z.boolean().optional(),
  stockAtMost: z.number().int().optional(),
  sort: z.enum(['name', 'stock']).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  offset: z.number().int().min(0).optional(),
})
