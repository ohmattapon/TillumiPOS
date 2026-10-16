/** Only changed, explicitly allowed JSON fields are included in update history. */
export function auditChanges(before: object, after: object, fields: readonly string[]) {
  const old = before as Record<string, unknown>, next = after as Record<string, unknown>
  const previous: Record<string, unknown> = {}, current: Record<string, unknown> = {}
  for (const field of fields) if (JSON.stringify(old[field]) !== JSON.stringify(next[field])) {
    previous[field] = old[field] ?? null
    current[field] = next[field] ?? null
  }
  return { before: previous, after: current, changed: Object.keys(current).length > 0 }
}
