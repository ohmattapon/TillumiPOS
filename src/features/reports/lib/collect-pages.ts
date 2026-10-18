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
