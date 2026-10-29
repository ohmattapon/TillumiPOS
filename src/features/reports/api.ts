import { queryOptions } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'
import { saleKeys } from '@/features/sales'
import { calendarDate, type ReportFilters } from './lib/date-range'
import { reportQueryParams } from './lib/report-query'
import type { ReportItemSort } from './lib/report-search-params'

export async function readReport(filters: ReportFilters) {
  const result = await unwrap(api.sales.reports.get({
    query: { ...reportQueryParams(filters), ...(filters.compare && { compare: true }) },
  }))
  return {
    ...result, from: calendarDate(result.from), to: calendarDate(result.to),
    days: { ...result.days, items: result.days.items.map((row) => ({ ...row, day: calendarDate(row.day) })) },
  }
}
export const readProducts = (filters: ReportFilters, offset: number, limit: number) =>
  unwrap(api.sales.reports.products.get({ query: { ...reportQueryParams(filters), offset, limit } }))
export const readPromotions = (filters: ReportFilters, offset: number, limit = 10) =>
  unwrap(api.sales.reports.promotions.get({ query: { ...reportQueryParams(filters), offset, limit } }))

export interface ItemsOptions { categoryId?: number | 'none'; sort: ReportItemSort }
export const readItems = (filters: ReportFilters, { categoryId, sort }: ItemsOptions, offset: number, limit = 10) =>
  unwrap(api.sales.reports.items.get({
    query: { ...reportQueryParams(filters), sort, ...(categoryId !== undefined && { categoryId: String(categoryId) }), offset, limit },
  }))
export const readCategories = (filters: ReportFilters, offset: number, limit = 10) =>
  unwrap(api.sales.reports.categories.get({ query: { ...reportQueryParams(filters), offset, limit } }))
// The cashier list is for choosing a filter, so it follows the dates only and never the cashier already chosen.
export const readCashiers = (range: Pick<ReportFilters, 'from' | 'to'>) =>
  unwrap(api.sales.reports.cashiers.get({ query: range }))

// compare is not part of the shared key: only the overview reads it, so the other tabs keep their cache when it flips.
const key = (filters: ReportFilters) => [...saleKeys.all, 'reports', reportQueryParams(filters)] as const
export const reportQuery = (filters: ReportFilters) => queryOptions({
  queryKey: [...key(filters), 'overview', filters.compare], queryFn: () => readReport(filters),
})
export const productsReportQuery = (filters: ReportFilters, offset: number) => queryOptions({
  queryKey: [...key(filters), 'products', offset], queryFn: () => readProducts(filters, offset, 10),
})
export const promotionsReportQuery = (filters: ReportFilters, offset: number) => queryOptions({
  queryKey: [...key(filters), 'promotions', offset], queryFn: () => readPromotions(filters, offset),
})
export const itemsReportQuery = (filters: ReportFilters, options: ItemsOptions, offset: number) => queryOptions({
  queryKey: [...key(filters), 'items', options, offset], queryFn: () => readItems(filters, options, offset),
})
export const categoriesReportQuery = (filters: ReportFilters, offset: number) => queryOptions({
  queryKey: [...key(filters), 'categories', offset], queryFn: () => readCategories(filters, offset),
})
export const cashiersReportQuery = (range: Pick<ReportFilters, 'from' | 'to'>) => queryOptions({
  queryKey: [...saleKeys.all, 'reports', 'cashiers', range.from, range.to], queryFn: () => readCashiers(range),
})
