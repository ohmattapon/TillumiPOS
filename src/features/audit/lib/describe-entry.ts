export function describeEntry(entry: { summary?: string; action: string }, t: (key: string) => string): string {
  return entry.summary || t(`actions.${entry.action}`)
}

const fields = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const format = (value: unknown) => value === undefined ? null : JSON.stringify(value)

export function auditChanges(before: unknown, after: unknown) {
  const previous = fields(before), next = fields(after)
  return [...new Set([...Object.keys(previous), ...Object.keys(next)])]
    .filter((field) => JSON.stringify(previous[field]) !== JSON.stringify(next[field]))
    .map((field) => ({ field, before: format(previous[field]), after: format(next[field]) }))
}
