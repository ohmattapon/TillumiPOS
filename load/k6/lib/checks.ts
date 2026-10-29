import { check } from 'k6'
import type { Response } from 'k6/http'

/** Checks the answer is a `{ items, total }` page and returns its items (empty when it is not). */
export function expectPage<T = Record<string, any>>(response: Response, label: string, options: { minItems?: number } = {}): T[] {
  const minItems = options.minItems ?? 0
  let items: T[] = []
  const isPage = check(response, {
    [`${label}: is a page`]: (res) => {
      if (res.status !== 200) return false
      const body = res.json()
      if (!Array.isArray(body?.items) || typeof body?.total !== 'number') return false
      items = body.items
      return true
    },
  })
  check(items, { [`${label}: has at least ${minItems} items`]: (list) => isPage && list.length >= minItems })
  return items
}
