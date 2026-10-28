import { z } from 'zod'

export const loginSchema = z.object({
  username: z.string().min(1),
  // 72 is bcrypt's limit and the longest password an account can hold: longer input can never match,
  // so it is refused before any hashing work happens.
  password: z.string().min(1).max(72),
})

export const setOwnPinSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  pin: z.string().max(100).nullable(),
})

export const switchUserSchema = z.object({
  userId: z.number().int().positive(),
  pin: z.string().min(1).max(20),
})
