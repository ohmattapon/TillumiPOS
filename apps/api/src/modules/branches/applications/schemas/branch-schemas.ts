import { z } from 'zod'

const name = z.string().trim().min(1).max(100)
// Blank means "none": the field is cleared, not stored as an empty string.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()

export const createBranchSchema = z.object({
  // Accepted in any case and normalized by the entity.
  code: z.string().trim().min(2).max(10),
  name,
  address: optionalText(500).optional(),
  phone: optionalText(30).optional(),
})

export const updateBranchSchema = z
  .object({
    name,
    address: optionalText(500),
    phone: optionalText(30),
    isActive: z.boolean(),
  })
  .partial()
