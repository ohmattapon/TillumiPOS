// The date ranges the report scenario asks for, counted back from the last day of the seeded history. Pure, so a
// Bun test can check it. The reports read calendar days in the shop's time zone (Bangkok).

export const RANGE_NAMES = ['day', 'month', 'year'] as const
export type RangeName = (typeof RANGE_NAMES)[number]

export interface ReportRange {
  from: string
  to: string
}

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
/** How many days each range holds, ending on the last day of history. */
const RANGE_DAYS: Record<RangeName, number> = { day: 1, month: 30, year: 365 }

function formatDay(utcMidnight: number): string {
  return new Date(utcMidnight).toISOString().slice(0, 10)
}

/** The calendar day (YYYY-MM-DD) of an instant in Bangkok. */
export function bangkokDay(at: Date): string {
  return formatDay(at.getTime() + BANGKOK_OFFSET_MS)
}

/**
 * The range of one name. The seeded history ends at the start of the reference day (the day the run began), so the
 * range ends on the day before it: a range never reaches into a day that has no bills yet.
 */
export function reportRange(name: RangeName, reference: Date): ReportRange {
  const lastDay = Date.parse(`${bangkokDay(reference)}T00:00:00Z`) - DAY_MS
  return { from: formatDay(lastDay - (RANGE_DAYS[name] - 1) * DAY_MS), to: formatDay(lastDay) }
}
