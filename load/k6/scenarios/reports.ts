// What the owner does on the reports screen: the overview of a day, a month and a year of the seeded history (100,000
// bills over 12 months), the lists under it, and the export, which walks /items page by page until it has every row.
//
// The ranges are never shortened to make the numbers look better: a year of history is the point of this scenario.
// Every request carries a `range` tag, so thresholds apply per range.
import { check, sleep } from 'k6'
import { Counter } from 'k6/metrics'
import { loginOwner } from '../lib/auth.ts'
import { api, type Session } from '../lib/client.ts'
import { expectPage } from '../lib/checks.ts'
import { config } from '../lib/config.ts'
import { walkPages } from '../lib/paging.ts'
import { RANGE_NAMES, reportRange, type RangeName, type ReportRange } from '../lib/report-range.ts'

export const options = {
  thresholds: {
    'http_req_duration{range:day}': ['p(95)<1000'],
    'http_req_duration{range:month}': ['p(95)<3000'],
    'http_req_duration{range:year}': ['p(95)<8000'],
  },
}

/** Pages the export read; a walk that stops at the cap is a failed check, not a silent stop. */
export const reportPagesFetched = new Counter('report_pages_fetched')

/** The export reads 500 rows a page (see collectPages in the web), and the walk never goes past this many pages. */
const EXPORT_PAGE_SIZE = 500
const EXPORT_MAX_PAGES = 20
/** The screen shows ten rows at a time. */
const SCREEN_PAGE_SIZE = 10

type Filter = { cashierId?: number; customer?: 'member' | 'guest' }

let session: Session | undefined
let cashierIds: number[] | undefined

function query(range: ReportRange, filter: Filter, extra: Record<string, string | number> = {}): string {
  const parts: [string, string | number][] = [['from', range.from], ['to', range.to], ...Object.entries(filter).map(([key, value]): [string, string | number] => [key, value as string | number]), ...Object.entries(extra)]
  return parts.map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`).join('&')
}

/** The filters an owner can put on a report, in the order the iterations take them. */
function filtersFor(cashiers: number[]): Filter[] {
  return [{}, ...cashiers.map((cashierId): Filter => ({ cashierId })), { customer: 'member' }, { customer: 'guest' }]
}

export function reports() {
  session ??= loginOwner()
  // The day the seeded history ends before, handed over by the runner, so the ranges match the seed.
  const reference = config().referenceDate
  const client = api(session)
  const tags = (range: RangeName) => ({ range })

  // The cashiers who sold, for the cashier filter; read once, from the year, because that is who has bills.
  if (!cashierIds) {
    const year = reportRange('year', reference)
    const response = client.get(`/api/v1/sales/reports/cashiers?${query(year, {})}`, { expect: [200], name: 'reports.cashiers', tags: tags('year') })
    cashierIds = expectPage<{ cashierId: number }>(response, 'cashiers report (year)', { minItems: 1 }).map((row) => row.cashierId)
  }
  // One counter walks every filter in turn, so each cashier gets its turn however many cashiers there are.
  const filters = filtersFor(cashierIds)
  const filter = filters[__ITER % filters.length]!
  // A slice that cannot be empty (a month or a year, or no filter at all) must hold rows; a day with a filter may not.
  const minItemsFor = (name: RangeName) => (name === 'day' && Object.keys(filter).length > 0 ? 0 : 1)

  // The overview of every range, with this iteration's filter.
  for (const name of RANGE_NAMES) {
    const range = reportRange(name, reference)
    const response = client.get(`/api/v1/sales/reports/?${query(range, filter)}`, { expect: [200], name: 'reports.overview', tags: tags(name) })
    check(response, {
      [`overview (${name}) has days and a summary`]: (res) => res.status === 200 && Array.isArray(res.json('days.items')) && typeof res.json('summary.saleCount') === 'number',
    })
    // An unfiltered overview of history that has bills in every range must show some.
    if (Object.keys(filter).length === 0) check(response, { [`overview (${name}) counts bills`]: (res) => res.status === 200 && (res.json('summary.saleCount') as number) > 0 })
  }

  // The lists under the overview, for one range per iteration so a year is not fetched five times in a row.
  const listed = RANGE_NAMES[__ITER % RANGE_NAMES.length]!
  const listedRange = reportRange(listed, reference)
  const page = { limit: SCREEN_PAGE_SIZE, offset: 0 }
  expectPage(client.get(`/api/v1/sales/reports/items?${query(listedRange, filter, { sort: 'sales', ...page })}`, { expect: [200], name: 'reports.items', tags: tags(listed) }), `items report (${listed})`, { minItems: minItemsFor(listed) })
  expectPage(client.get(`/api/v1/sales/reports/categories?${query(listedRange, filter, page)}`, { expect: [200], name: 'reports.categories', tags: tags(listed) }), `categories report (${listed})`, { minItems: minItemsFor(listed) })
  expectPage(client.get(`/api/v1/sales/reports/products?${query(listedRange, filter, page)}`, { expect: [200], name: 'reports.products', tags: tags(listed) }), `products report (${listed})`, { minItems: minItemsFor(listed) })
  expectPage(client.get(`/api/v1/sales/reports/promotions?${query(listedRange, filter, page)}`, { expect: [200], name: 'reports.promotions', tags: tags(listed) }), `promotions report (${listed})`)
  expectPage(client.get(`/api/v1/sales/reports/cashiers?${query(listedRange, {})}`, { expect: [200], name: 'reports.cashiers', tags: tags(listed) }), `cashiers report (${listed})`, { minItems: 1 })

  // The export: every row of /items, 500 at a time, from a different range each iteration.
  const exported = RANGE_NAMES[(__ITER + 1) % RANGE_NAMES.length]!
  const exportRange = reportRange(exported, reference)
  const walk = walkPages(
    (offset, limit) => {
      const response = client.get(`/api/v1/sales/reports/items?${query(exportRange, filter, { sort: 'sales', limit, offset })}`, { expect: [200], name: 'reports.items.export', tags: tags(exported) })
      reportPagesFetched.add(1)
      if (response.status !== 200) return null
      const items = response.json('items') as unknown[] | null
      const total = response.json('total')
      return Array.isArray(items) && typeof total === 'number' ? { rows: items.length, total } : null
    },
    { limit: EXPORT_PAGE_SIZE, maxPages: EXPORT_MAX_PAGES },
  )
  check(walk, { [`export of items (${exported}) reads every row within the page cap`]: (result) => result.complete })
  sleep(1)
}
