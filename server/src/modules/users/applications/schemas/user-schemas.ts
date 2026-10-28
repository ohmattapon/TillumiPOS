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
  role: role.optional(),
  roleId: z.number().int().positive().optional(),
  branchId: z.number().int().positive().optional(),
}).refine((value) => value.roleId !== undefined || value.role !== undefined, 'ต้องระบุบทบาท')

export const updateUserSchema = z
  .object({
    password,
    displayName,
    role,
    roleId: z.number().int().positive(),
    branchId: z.number().int().positive(),
    isActive: z.boolean(),
  })
  .partial()

/** Null clears the PIN. The format is a domain rule (assertValidPin), checked by the use case. */
export const setPinSchema = z.object({ pin: z.string().max(100).nullable() })
