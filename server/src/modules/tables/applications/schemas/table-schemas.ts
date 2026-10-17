import { z } from 'zod'

const name = z.string().min(1).max(50)
const zone = z.string().min(1).max(50).nullable()
const whole = z.number().int()

export const createTableSchema = z.object({
  name,
  zone: zone.optional(),
  seats: whole.optional(),
  x: whole.optional(),
  y: whole.optional(),
  width: whole.optional(),
  height: whole.optional(),
  sortOrder: whole.optional(),
})

export const updateTableSchema = z
  .object({
    name,
    zone,
    seats: whole,
    x: whole,
    y: whole,
    width: whole,
    height: whole,
    sortOrder: whole,
    isActive: z.boolean(),
  })
  .partial()
