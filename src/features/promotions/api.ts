import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'
import type { PromotionBody } from './lib/promotion-form'

export const promotionKeys = { all: ['promotions'] as const }

export interface PromotionFilters {
  isActive?: boolean
  limit?: number
  offset?: number
}

const fetchPromotions = (filters: PromotionFilters) =>
  unwrap(api.promotions.get({ query: { limit: 100, offset: 0, ...filters } }))

export type Promotion = Awaited<ReturnType<typeof fetchPromotions>>['items'][number]

export const promotionsQuery = (filters: PromotionFilters = {}) =>
  queryOptions({
    queryKey: [...promotionKeys.all, 'list', filters],
    queryFn: () => fetchPromotions(filters),
  })

/** What the till reads to show the promotion the cart will be given. The server decides again at payment. */
export const activePromotionsQuery = queryOptions({
  queryKey: [...promotionKeys.all, 'active'],
  queryFn: () => fetchPromotions({ isActive: true, limit: 500 }),
  staleTime: 60_000,
})

export function useCreatePromotion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: PromotionBody) => unwrap(api.promotions.post(body)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: promotionKeys.all }),
  })
}

export function useUpdatePromotion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: Partial<PromotionBody> }) =>
      unwrap(api.promotions({ id }).patch(changes)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: promotionKeys.all }),
  })
}

export interface QuoteInput {
  lines?: { productId: number; quantity: number; options?: number[]; packId?: number }[]
  memberId?: number | null
  orderId?: number
  /** The points the member spends; the quote prices them, none for an open order. */
  redeemPoints?: number
}

const requestQuote = (input: QuoteInput) => unwrap(api.quotes.post(input))

export type Quote = Awaited<ReturnType<typeof requestQuote>>

/** Prices the cart (or an open order) on the server and pins the result. Nothing is locked or deducted. */
export function useCreateQuote() {
  return useMutation({ mutationFn: requestQuote })
}
