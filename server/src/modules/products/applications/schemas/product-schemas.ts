import { z } from 'zod'
import { MAX_PACKS_PER_PRODUCT } from '../../../../domains/product-pack'
import { PRODUCT_TYPES } from '../../../../domains/product.domain'

const fields = {
  sku: z.string().min(1).max(64),
  barcode: z.string().min(1).max(64).nullable(),
  name: z.string().min(1).max(200),
  categoryId: z.number().int().nullable(),
  productType: z.enum(PRODUCT_TYPES),
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
const packs = z.array(pack).max(MAX_PACKS_PER_PRODUCT)

// z.object() drops unknown keys, so stock, image and id can never be set through these.
export const createProductSchema = z.object({
  sku: fields.sku.optional(),
  name: fields.name,
  priceSatang: fields.priceSatang,
  barcode: fields.barcode.optional(),
  categoryId: fields.categoryId.optional(),
  productType: fields.productType.optional(),
  costSatang: fields.costSatang.optional(),
  trackStock: fields.trackStock.optional(),
  packs: packs.optional(),
})

export const updateProductSchema = z.object({ ...fields, packs }).partial()

export const listProductsSchema = z.object({
  q: z.string().optional(),
  code: z.string().min(1).max(64).optional(),
  categoryId: z.number().int().optional(),
  productType: fields.productType.optional(),
  includeInactive: z.boolean().optional(),
  isActive: z.boolean().optional(),
  stockAtMost: z.number().int().optional(),
  sort: z.enum(['name', 'stock']).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  offset: z.number().int().min(0).optional(),
})
