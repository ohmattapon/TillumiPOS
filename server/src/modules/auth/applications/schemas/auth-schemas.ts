import { z } from 'zod'

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

export const setOwnPinSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  pin: z.string().max(100).nullable(),
})
