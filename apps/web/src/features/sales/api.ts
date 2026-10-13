import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { productKeys } from '@/features/products'
import { api, apiV2, unwrap } from '@/lib/api'
import { checkoutModeQuery, shiftKeys } from '@/features/shifts'

export const saleKeys = {
  /** Prefix of every sales query: invalidate this after a sale is made or voided. */
  all: ['sales'] as const,
  today: () => [...saleKeys.all, 'today'] as const,
  todaySummary: () => [...saleKeys.all, 'today', 'summary'] as const,
  detail: (id: number) => [...saleKeys.all, 'detail', id] as const,
}

/** Start of today and of tomorrow in the browser's time zone. */
export function todayRange() {
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  const to = new Date(from)
  to.setDate(to.getDate() + 1)
  return { from, to }
}

export const salesTodayQuery = queryOptions({
  queryKey: saleKeys.today(),
  queryFn: async () => (await unwrap(api.sales.get({ query: { ...todayRange(), limit: 500 } }))).items,
})

/** Owner only: the API refuses cashiers, so enable this query conditionally. */
export const summaryTodayQuery = queryOptions({
  queryKey: saleKeys.todaySummary(),
  queryFn: () => unwrap(api.sales.summary.get({ query: todayRange() })),
})

export const saleQuery = (id: number) =>
  queryOptions({
    queryKey: saleKeys.detail(id),
    queryFn: () => unwrap(api.sales({ id }).get()),
  })

export function useVoidSale(id: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (reason: string) => {
      const mode = await queryClient.fetchQuery(checkoutModeQuery)
      if (mode.checkoutMode === 'shifts')
        return unwrap(apiV2.sales({ id }).void.post({ reason }, { headers: { 'idempotency-key': crypto.randomUUID() } }))
      return unwrap(api.sales({ id }).void.post({ reason }))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: saleKeys.all })
      // Voiding returns the stock.
      queryClient.invalidateQueries({ queryKey: productKeys.all })
    },
  })
}

export function useCashRefund(saleId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ shiftId, reason }: { shiftId: number; reason: string }) =>
      unwrap(apiV2.sales({ id: saleId })['cash-refund'].post({ shiftId, reason }, { headers: { 'idempotency-key': crypto.randomUUID() } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: shiftKeys.all }),
  })
}
