export interface ReportFilters { from: string; to: string; scope: 'branch' | 'all' }

/** Eden decodes ISO calendar-date response strings into Date objects at runtime. */
export function calendarDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value
}
export function todayInTimeZone(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const part = (name: string) => parts.find((p) => p.type === name)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
export function validRange(from: string, to: string) {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
  if (!valid(from) || !valid(to)) return false
  const days = (Date.parse(to) - Date.parse(from)) / 86400000
  return days >= 0 && days <= 365
}
export type Preset = 'today' | 'week' | 'month' | 'previousMonth'
export function presetRange(preset: Preset, today: string) {
  const end = new Date(`${today}T00:00:00Z`)
  const start = new Date(end)
  if (preset === 'week') start.setUTCDate(start.getUTCDate() - 6)
  if (preset === 'month') start.setUTCDate(1)
  if (preset === 'previousMonth') {
    end.setUTCDate(0)
    start.setUTCDate(1)
    start.setUTCMonth(start.getUTCMonth() - 1)
  }
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) }
}
