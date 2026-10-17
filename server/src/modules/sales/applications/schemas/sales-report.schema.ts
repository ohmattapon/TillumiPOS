import { z } from 'zod'

export const salesReportSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  scope: z.enum(['branch', 'all']).default('branch'),
}).refine(({ from, to }) => {
  const days = (Date.parse(to) - Date.parse(from)) / 86400000
  return days >= 0 && days <= 365
}, { message: 'เลือกช่วงวันตามลำดับและไม่เกิน 366 วัน' })
export const salesReportPageSchema = salesReportSchema.safeExtend({
  limit: z.number().int().min(1).max(500).default(20),
  offset: z.number().int().min(0).default(0),
})
