import type { ReportFilters } from './date-range'

export type ReportTab = 'overview' | 'items' | 'categories' | 'promotions'
export type ReportItemSort = 'quantity' | 'sales' | 'profit' | 'margin'
export const REPORT_TABS: readonly ReportTab[] = ['overview', 'items', 'categories', 'promotions']
export const REPORT_ITEM_SORTS: readonly ReportItemSort[] = ['quantity', 'sales', 'profit', 'margin']

export type ReportSearch = ReportFilters & {
  tab: ReportTab
  categoryId?: number | 'none'
  sort: ReportItemSort
}

const positiveInteger = (value: string | null) => {
  if (value === null || !/^[1-9]\d{0,9}$/.test(value)) return undefined
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : undefined
}

/**
 * The report's filters live in the URL so a link keeps them. `today` gives the default month.
 * from and to are passed on as typed so the page can say the range is wrong instead of silently changing it.
 */
export function readReportSearch(params: URLSearchParams, today: string): ReportSearch {
  const tab = REPORT_TABS.find((name) => name === params.get('tab')) ?? 'overview'
  const sort = REPORT_ITEM_SORTS.find((name) => name === params.get('sort')) ?? 'quantity'
  const customer = params.get('customer')
  const cashierId = positiveInteger(params.get('cashierId'))
  const category = params.get('categoryId')
  const categoryId = category === 'none' ? 'none' : positiveInteger(category)
  const compare = params.get('compare')
  return {
    from: params.get('from') ?? today.slice(0, 7) + '-01',
    to: params.get('to') ?? today,
    ...(cashierId !== undefined && { cashierId }),
    ...((customer === 'member' || customer === 'guest') && { customer }),
    compare: compare === '1' || compare === 'true',
    tab,
    ...(categoryId !== undefined && { categoryId }),
    sort,
  }
}

/** Leaves out every default, so the plain link for a month stays `?from=…&to=…`. */
export function writeReportSearch(search: ReportSearch): URLSearchParams {
  const params = new URLSearchParams({ from: search.from, to: search.to })
  if (search.cashierId !== undefined) params.set('cashierId', String(search.cashierId))
  if (search.customer !== undefined) params.set('customer', search.customer)
  if (search.compare) params.set('compare', '1')
  if (search.tab !== 'overview') params.set('tab', search.tab)
  if (search.categoryId !== undefined) params.set('categoryId', String(search.categoryId))
  if (search.sort !== 'quantity') params.set('sort', search.sort)
  return params
}
