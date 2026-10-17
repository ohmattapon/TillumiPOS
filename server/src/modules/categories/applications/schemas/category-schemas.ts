import { z } from 'zod'

const name = z.string().min(1).max(100)
const sortOrder = z.number().int()

// z.object() drops unknown keys, so callers cannot set id or (on create) isActive.
export const createCategorySchema = z.object({
  name,
  sortOrder: sortOrder.optional(),
})

export const updateCategorySchema = z
  .object({
    name,
    sortOrder,
    isActive: z.boolean(),
  })
  .partial()
