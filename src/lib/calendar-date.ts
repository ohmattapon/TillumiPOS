/** Calendar controls use local Date objects; report filters use civil YYYY-MM-DD strings. */
export function fromCalendarDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const [year, month, day] = value.split('-').map(Number)
  if (year < 1) return undefined
  const date = new Date(0)
  // Noon avoids DST changes at midnight. setFullYear also preserves years below 100.
  date.setFullYear(year, month - 1, day)
  date.setHours(12, 0, 0, 0)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : undefined
}

export function toCalendarDate(date: Date): string {
  if (!Number.isFinite(date.getTime()) || date.getFullYear() < 1 || date.getFullYear() > 9999) return ''
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** The calendar date `YYYY-MM-DD` in the shop's time zone, so "today" is the shop's day, not the browser's. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const part = (name: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === name)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
