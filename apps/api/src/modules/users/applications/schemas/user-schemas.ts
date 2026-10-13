import { z } from 'zod'
import { USER_ROLES } from '../../../../domains/user-role.vo'

const password = z.string().min(8).max(72)
const displayName = z.string().min(1).max(100)
const role = z.enum(USER_ROLES)

export const createUserSchema = z.object({
  // Upper case is accepted here and normalized by the use case.
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_.-]+$/),
  password,
  displayName,
  role,
})

export const updateUserSchema = z
  .object({
    password,
    displayName,
    role,
    isActive: z.boolean(),
  })
  .partial()
