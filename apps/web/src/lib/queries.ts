import { queryOptions } from '@tanstack/react-query'
import { api, unwrap } from './api'

/** Tracked products at or below this quantity are flagged as running low. */
export const LOW_STOCK_THRESHOLD = 5

export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: () => unwrap(api.auth.me.get()),
  retry: false,
  staleTime: Infinity,
})

export const categoriesQuery = queryOptions({
  queryKey: ['categories'],
  queryFn: async () => (await unwrap(api.catalog.categories.get())).items,
})

export const productsQuery = (includeInactive = false) =>
  queryOptions({
    queryKey: ['products', { includeInactive }],
    queryFn: async () => (await unwrap(api.catalog.products.get({ query: { includeInactive, limit: 1000 } }))).items,
  })

/** Start of today and of tomorrow in the browser's time zone. */
export function todayRange() {
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  const to = new Date(from)
  to.setDate(to.getDate() + 1)
  return { from, to }
}

export const salesTodayQuery = queryOptions({
  queryKey: ['sales', 'today'],
  queryFn: async () => (await unwrap(api.sales.get({ query: { ...todayRange(), limit: 500 } }))).items,
})

export const summaryTodayQuery = queryOptions({
  queryKey: ['sales', 'today', 'summary'],
  queryFn: () => unwrap(api.sales.summary.get({ query: todayRange() })),
})
