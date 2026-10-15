import { queryOptions } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'
import { saleKeys } from '@/features/sales'
import { calendarDate, type ReportFilters } from './lib/date-range'

export async function readReport(filters: ReportFilters, branchId: number) {
  const result = await unwrap(api.sales.reports.get({ query: filters, headers: { 'x-branch-id': String(branchId) } }))
  return {
    ...result, from: calendarDate(result.from), to: calendarDate(result.to),
    days: { ...result.days, items: result.days.items.map((row) => ({ ...row, day: calendarDate(row.day) })) },
  }
}
export const readProducts = (filters: ReportFilters, branchId: number, offset: number, limit: number) =>
  unwrap(api.sales.reports.products.get({ query: { ...filters, offset, limit }, headers: { 'x-branch-id': String(branchId) } }))
export const readBranches = (filters: ReportFilters, branchId: number, offset: number, limit: number) =>
  unwrap(api.sales.reports.branches.get({ query: { ...filters, offset, limit }, headers: { 'x-branch-id': String(branchId) } }))

const key = (filters: ReportFilters, branchId: number) => [...saleKeys.all, 'reports', branchId, filters] as const
export const reportQuery = (filters: ReportFilters, branchId: number) => queryOptions({
  queryKey: [...key(filters, branchId), 'overview'], queryFn: () => readReport(filters, branchId),
})
export const productsReportQuery = (filters: ReportFilters, branchId: number, offset: number) => queryOptions({
  queryKey: [...key(filters, branchId), 'products', offset], queryFn: () => readProducts(filters, branchId, offset, 10),
})
export const branchesReportQuery = (filters: ReportFilters, branchId: number, offset: number) => queryOptions({
  queryKey: [...key(filters, branchId), 'branches', offset], queryFn: () => readBranches(filters, branchId, offset, 10),
})
