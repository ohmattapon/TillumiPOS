import { z } from 'zod'

const rangeFields = {
  from: z.iso.date(),
  to: z.iso.date(),
  scope: z.enum(['branch', 'all']).default('branch'),
}
const inRange = ({ from, to }: { from: string; to: string }) => {
  const days = (Date.parse(to) - Date.parse(from)) / 86400000
  return days >= 0 && days <= 365
}
const rangeMessage = { message: 'เลือกช่วงวันตามลำดับและไม่เกิน 366 วัน' }
const rangeSchema = z.object(rangeFields).refine(inRange, rangeMessage)
/** Only the overview compares; the other reports must not carry a `compare` flag to their repositories. */
export const salesReportSchema = z.object({ ...rangeFields, compare: z.union([z.boolean(), z.enum(['true', 'false'])]).transform((value) => value === true || value === 'true').default(false) }).refine(inRange, rangeMessage)
export const salesReportPageSchema = rangeSchema.safeExtend({
  limit: z.number().int().min(1).max(500).default(20),
  offset: z.number().int().min(0).default(0),
})
