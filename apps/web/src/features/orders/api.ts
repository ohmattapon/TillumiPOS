import type { Order } from '@pos/api/types'
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { productKeys } from '@/features/products'
import { saleKeys } from '@/features/sales'
import { api, apiV2, unwrap } from '@/lib/api'
import type { PaymentInput } from '@/lib/money'

export const orderKeys = {
  /** Prefix of every order query. */
  all: ['orders'] as const,
  open: () => [...orderKeys.all, 'list', { status: 'open' }] as const,
  detail: (id: number) => [...orderKeys.all, 'detail', id] as const,
}

/** The open orders of the branch: a restaurant has few at a time, so they are read in one request. */
export const openOrdersQuery = queryOptions({
  queryKey: orderKeys.open(),
  queryFn: async () => (await unwrap(api.orders.get({ query: { status: 'open', limit: 200 } }))).items,
  // Other tills open and pay orders too; keep the list close to the truth without a push channel.
  refetchInterval: 15_000,
})

export const orderQuery = (id: number) =>
  queryOptions({
    queryKey: orderKeys.detail(id),
    queryFn: () => unwrap(api.orders({ id }).get()),
  })

/** After a change the answer is the whole order: put it in the cache so the cart updates at once. */
function useOrderCache() {
  const queryClient = useQueryClient()
  return (order: Order) => {
    queryClient.setQueryData(orderKeys.detail(order.id), order)
    void queryClient.invalidateQueries({ queryKey: orderKeys.open() })
  }
}

export interface OpenOrderInput {
  label?: string | null
  items?: { productId: number; quantity: number }[]
}

export function useOpenOrder() {
  const remember = useOrderCache()

  return useMutation({
    mutationFn: (input: OpenOrderInput) => unwrap(api.orders.post(input)),
    onSuccess: remember,
  })
}

export function useAddOrderItem() {
  const remember = useOrderCache()

  return useMutation({
    mutationFn: ({ orderId, productId, quantity }: { orderId: number; productId: number; quantity: number }) =>
      unwrap(api.orders({ id: orderId }).items.post({ productId, quantity })),
    onSuccess: remember,
  })
}

export function useSetOrderItemQuantity() {
  const remember = useOrderCache()

  return useMutation({
    mutationFn: ({ orderId, productId, quantity }: { orderId: number; productId: number; quantity: number }) =>
      unwrap(api.orders({ id: orderId }).items({ productId }).patch({ quantity })),
    onSuccess: remember,
  })
}

export function useRemoveOrderItem() {
  const remember = useOrderCache()

  return useMutation({
    mutationFn: ({ orderId, productId }: { orderId: number; productId: number }) =>
      unwrap(api.orders({ id: orderId }).items({ productId }).delete()),
    onSuccess: remember,
  })
}

export function useCancelOrder() {
  const remember = useOrderCache()

  return useMutation({
    mutationFn: ({ orderId, reason }: { orderId: number; reason: string }) =>
      unwrap(api.orders({ id: orderId }).cancel.post({ reason })),
    onSuccess: remember,
  })
}

export interface PayOrderInput {
  orderId: number
  discountSatang: number
  payment: PaymentInput
  shiftId?: number
  idempotencyKey?: string
}

/** Pays the order. It becomes a sale, so stock, sales and the order list all change. */
export function usePayOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ orderId, discountSatang, payment, shiftId, idempotencyKey }: PayOrderInput) => {
      if (shiftId !== undefined)
        return unwrap(apiV2.orders({ id: orderId }).pay.post({ discountSatang, payments: [payment], shiftId }, { headers: { 'idempotency-key': idempotencyKey ?? crypto.randomUUID() } }))
      return unwrap(api.orders({ id: orderId }).pay.post({ discountSatang, payments: [payment] }))
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: orderKeys.all }),
        queryClient.invalidateQueries({ queryKey: productKeys.all }),
        queryClient.invalidateQueries({ queryKey: saleKeys.all }),
      ]),
  })
}

export type { Order }
