import { z } from 'zod'

export const auditFilterSchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  actorId: z.number().int().positive().optional(),
  action: z.string().min(1).max(100).optional(),
  entityType: z.string().min(1).max(100).optional(),
  entityId: z.string().min(1).max(100).optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
})
