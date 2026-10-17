import { z } from 'zod'
import { isPermission } from '../../../../domains/permission.vo'
import { DomainError } from '../../../../domains/errors/domain-error'
const permissions = z.array(z.string()).max(60).transform((values) => values.map((value) => {
  if (!isPermission(value)) throw new DomainError('สิทธิ์ไม่ถูกต้อง', 'INVALID_ROLE')
  return value
}))
export const createRoleSchema = z.object({ name: z.string().trim().min(1).max(60), permissions })
export const updateRoleSchema = createRoleSchema.partial()
export const roleIdSchema = z.number().int().positive()
export const listRolesSchema = z.object({ limit: z.number().int().min(1).max(500).default(100), offset: z.number().int().min(0).default(0) })
