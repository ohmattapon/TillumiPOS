/** Exports every page, and refuses a changing result set rather than silently losing rows. */
export async function collectPages<T>(load: (offset: number, limit: number) => Promise<{ items: T[]; total: number }>): Promise<T[]> {
  const items: T[] = []
  let expected: number | undefined
  while (items.length !== expected) {
    const page = await load(items.length, 500)
    if (expected !== undefined && expected !== page.total) throw new Error('REPORT_CHANGED')
    expected = page.total
    if (expected > 1048570) throw new Error('REPORT_TOO_LARGE')
    items.push(...page.items)
    if (items.length !== expected && (page.items.length === 0 || items.length > expected)) throw new Error('REPORT_CHANGED')
  }
  return items
}

/**
 * Like collectPages, for routes that also send a figure over every row (totals). The figure must be the
 * same on every page, otherwise the data moved while it was being read and the export is refused.
 */
export async function collectPagesWith<P extends { items: unknown[]; total: number }, X>(
  load: (offset: number, limit: number) => Promise<P>,
  pick: (page: P) => X,
): Promise<{ items: P["items"]; extra: X }> {
  let seen: string | undefined
  let extra: X | undefined
  const items = await collectPages<P["items"][number]>(async (offset, limit) => {
    const page = await load(offset, limit)
    const value = pick(page)
    const text = JSON.stringify(value)
    if (seen !== undefined && seen !== text) throw new Error('REPORT_CHANGED')
    seen = text
    extra = value
    return page
  })
  return { items, extra: extra as X }
}
