import { z } from 'zod'

const name = z.string().trim().min(1).max(120)
const phone = z.string().min(1).max(80)
export const createMemberSchema = z.object({ name, phone })
export const updateMemberSchema = z.object({ name: name.optional(), phone: phone.optional(), isActive: z.boolean().optional() })
export const memberIdSchema = z.object({ id: z.number().int().positive() })
const pagination = { limit: z.number().int().min(1).max(500).default(20), offset: z.number().int().min(0).default(0) }
export const listMembersSchema = z.object({ search: z.string().trim().max(120).optional(), isActive: z.boolean().optional(), ...pagination })
export const memberHistorySchema = z.object({
  from: z.iso.date().optional(), to: z.iso.date().optional(),
  status: z.enum(['completed', 'voided']).optional(), ...pagination,
}).refine(({ from, to }) => !from || !to || from <= to, { message: 'วันเริ่มต้นต้องไม่เกินวันสิ้นสุด' })

/** A movement a person types in by hand, which is why it needs a reason and a bound. */
export const adjustMemberPointsSchema = z.object({
  points: z.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0, {
    message: 'ต้องระบุจำนวนแต้มที่ไม่ใช่ศูนย์',
  }),
  reason: z.string().trim().min(1).max(200),
})

export const memberPointsQuerySchema = z.object({ ...pagination })
