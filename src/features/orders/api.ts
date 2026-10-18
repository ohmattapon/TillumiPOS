import type { Order } from '@pos/api/types'
import { queryOptions, useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query'
import { productKeys } from '@/features/products'
import { saleKeys } from '@/features/sales'
import { withHeldQuote } from '@/features/promotions'
import { tableKeys } from '@/features/tables'
import { api, apiV2, unwrap } from '@/lib/api'
import type { PaymentInput } from '@/lib/money'

export const orderKeys = {
  /** Prefix of every order query. */
  all: ['orders'] as const,
  open: () => [...orderKeys.all, 'list', 'open'] as const,
  openPage: (filters: object) => [...orderKeys.open(), filters] as const,
  detail: (id: number) => [...orderKeys.all, 'detail', id] as const,
}

/** One page of open orders, oldest first. The badge reads total, independently of the page. */
export const openOrdersQuery = (filters: { tableId?: number; excludeId?: number; limit?: number; offset?: number } = {}) => queryOptions({
  queryKey: orderKeys.openPage(filters),
  queryFn: () => unwrap(api.orders.get({ query: { status: 'open', limit: 10, offset: 0, ...filters } })),
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
    // What is open on a table changes with every order.
    void queryClient.invalidateQueries({ queryKey: tableKeys.all })
  }
}

export interface OpenOrderInput {
  memberId?: number | null
  label?: string | null
  tableId?: number | null
  items?: { productId: number; quantity: number; options?: number[] }[]
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
    mutationFn: ({
      orderId,
      productId,
      quantity,
      options,
    }: {
      orderId: number
      productId: number
      quantity: number
      options?: number[]
    }) => unwrap(api.orders({ id: orderId }).items.post({ productId, quantity, options })),
    onSuccess: remember,
  })
}

/** Sets how many of one line, by its id; the same product with other options is another line. */
export function useSetOrderLineQuantity() {
  const remember = useOrderCache()

  return useMutation({
    mutationFn: ({ orderId, lineId, quantity }: { orderId: number; lineId: number; quantity: number }) =>
      unwrap(api.orders({ id: orderId }).lines({ lineId }).patch({ quantity })),
    onSuccess: remember,
  })
}

/** Shared by the note mutation and by anyone who must know, synchronously, whether a note save is pending. */
export const lineNoteMutationKey = ['orders', 'line-note'] as const

/** True while any line note is being written, so a ticket is not sent ahead of the note it should carry. */
export function useIsSavingLineNote() {
  return useIsMutating({ mutationKey: lineNoteMutationKey }) > 0
}

/** Writes or clears the note of one line. */
export function useSetOrderLineNote() {
  const remember = useOrderCache()

  return useMutation({
    mutationKey: lineNoteMutationKey,
    mutationFn: ({ orderId, lineId, note }: { orderId: number; lineId: number; note: string | null }) =>
      unwrap(api.orders({ id: orderId }).lines({ lineId }).note.patch({ note })),
    onSuccess: remember,
  })
}

export function useRemoveOrderLine() {
  const remember = useOrderCache()

  return useMutation({
    mutationFn: ({ orderId, lineId }: { orderId: number; lineId: number }) =>
      unwrap(api.orders({ id: orderId }).lines({ lineId }).delete()),
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
  quoteId?: number
  payment: PaymentInput
  shiftId?: number
  idempotencyKey?: string
}

/** Pays the order. It becomes a sale, so stock, sales and the order list all change. */
export function usePayOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ orderId, discountSatang, quoteId, payment, shiftId, idempotencyKey }: PayOrderInput) =>
      withHeldQuote(quoteId, async (pinned) => {
        const discount = pinned === undefined ? discountSatang : 0
        if (shiftId !== undefined)
          return unwrap(
            apiV2.orders({ id: orderId }).pay.post(
              { discountSatang: discount, payments: [payment], shiftId, quoteId: pinned },
              { headers: { 'idempotency-key': idempotencyKey ?? crypto.randomUUID() } },
            ),
          )
        return unwrap(api.orders({ id: orderId }).pay.post({ discountSatang: discount, payments: [payment], quoteId: pinned }))
      }),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: orderKeys.all }),
        queryClient.invalidateQueries({ queryKey: productKeys.all }),
        queryClient.invalidateQueries({ queryKey: saleKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['members'] }),
        queryClient.invalidateQueries({ queryKey: tableKeys.all }),
      ]),
  })
}

export function useMoveOrder() {
  const remember = useOrderCache()

  return useMutation({
    mutationFn: ({ orderId, tableId }: { orderId: number; tableId: number | null }) =>
      unwrap(api.orders({ id: orderId }).move.post({ tableId })),
    onSuccess: remember,
  })
}

/** Takes the lines of `sourceOrderId` onto `orderId`; the source is closed as merged. */
export function useMergeOrders() {
  const queryClient = useQueryClient()
  const remember = useOrderCache()

  return useMutation({
    mutationFn: ({ orderId, sourceOrderId }: { orderId: number; sourceOrderId: number }) =>
      unwrap(api.orders({ id: orderId }).merge.post({ sourceOrderId })),
    onSuccess: (order) => {
      remember(order)
      void queryClient.invalidateQueries({ queryKey: orderKeys.all })
    },
  })
}

/** Moves part of the lines onto a new order on the same table and answers with that order. */
export function useSplitOrder() {
  const queryClient = useQueryClient()
  const remember = useOrderCache()

  return useMutation({
    mutationFn: ({
      orderId,
      lines,
      label,
    }: {
      orderId: number
      lines: { lineId: number; quantity: number }[]
      label?: string | null
    }) => unwrap(api.orders({ id: orderId }).split.post({ lines, label })),
    onSuccess: (order) => {
      remember(order)
      void queryClient.invalidateQueries({ queryKey: orderKeys.all })
    },
  })
}

export type { Order }

export function useSetOrderMember() {
  const remember = useOrderCache()
  return useMutation({
    mutationFn: ({ orderId, memberId }: { orderId: number; memberId: number | null }) => unwrap(api.orders({ id: orderId }).member.patch({ memberId })),
    onSuccess: remember,
  })
}
