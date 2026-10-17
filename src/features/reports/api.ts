import { queryOptions } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'
import { saleKeys } from '@/features/sales'
import { calendarDate, type ReportFilters } from './lib/date-range'

export async function readReport(filters: ReportFilters) {
  const result = await unwrap(api.sales.reports.get({ query: filters }))
  return {
    ...result, from: calendarDate(result.from), to: calendarDate(result.to),
    days: { ...result.days, items: result.days.items.map((row) => ({ ...row, day: calendarDate(row.day) })) },
  }
}
export const readProducts = (filters: ReportFilters, offset: number, limit: number) =>
  unwrap(api.sales.reports.products.get({ query: { ...filters, offset, limit } }))
export const readBranches = (filters: ReportFilters, offset: number, limit: number) =>
  unwrap(api.sales.reports.branches.get({ query: { ...filters, offset, limit } }))

const key = (filters: ReportFilters) => [...saleKeys.all, 'reports', filters] as const
export const reportQuery = (filters: ReportFilters) => queryOptions({
  queryKey: [...key(filters), 'overview'], queryFn: () => readReport(filters),
})
export const productsReportQuery = (filters: ReportFilters, offset: number) => queryOptions({
  queryKey: [...key(filters), 'products', offset], queryFn: () => readProducts(filters, offset, 10),
})
export const branchesReportQuery = (filters: ReportFilters, offset: number) => queryOptions({
  queryKey: [...key(filters), 'branches', offset], queryFn: () => readBranches(filters, offset, 10),
})
