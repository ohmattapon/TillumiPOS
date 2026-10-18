import { z } from 'zod'
import { MAX_GROUP_SELECTIONS } from '../../../../domains/modifier.domain'

const name = z.string().min(1).max(100)
const sortOrder = z.number().int()
const maxSelections = z.number().int().min(1).max(MAX_GROUP_SELECTIONS)
const satang = z.number().int().min(0)

export const createModifierGroupSchema = z.object({
  name,
  required: z.boolean().optional(),
  maxSelections: maxSelections.optional(),
  sortOrder: sortOrder.optional(),
})

export const updateModifierGroupSchema = z
  .object({ name, required: z.boolean(), maxSelections, sortOrder, isActive: z.boolean() })
  .partial()

export const createModifierOptionSchema = z.object({
  name,
  priceSatang: satang.optional(),
  costSatang: satang.optional(),
  sortOrder: sortOrder.optional(),
  isDefault: z.boolean().optional(),
})

export const updateModifierOptionSchema = z
  .object({ name, priceSatang: satang, costSatang: satang, sortOrder, isActive: z.boolean(), isDefault: z.boolean() })
  .partial()

export const setProductModifierGroupsSchema = z.object({
  groupIds: z.array(z.number().int().positive()).max(50),
})
