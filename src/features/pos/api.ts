import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { productKeys } from '@/features/products'
import { saleKeys } from '@/features/sales'
import { withHeldQuote } from '@/features/promotions'
import type { Sale } from '@pos/api/types'
import { api, apiV2, unwrap } from '@/lib/api'
import type { PaymentInput } from '@/lib/money'
import { withIdempotencyKey } from '@/lib/idempotency-key'

export interface CheckoutInput {
  memberId?: number | null
  /** A price pinned by the server; the sale is made at it. */
  quoteId?: number
  items: { productId: number; quantity: number; options?: number[] }[]
  discountSatang: number
  payment: PaymentInput
  shiftId?: number
  idempotencyKey?: string
}

/** Records the sale. The receipt number, VAT and stock deduction are decided by the server. */
export function useCheckout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ items, discountSatang, payment, shiftId, idempotencyKey, memberId, quoteId }: CheckoutInput): Promise<Sale> =>
      // A QR the till no longer knows the quote of is sold with the quote the server names.
      withHeldQuote(quoteId, async (pinned) => {
        // A pinned price already holds the discount; a typed one is never sent with it.
        const discount = pinned === undefined ? discountSatang : 0
        if (shiftId !== undefined) {
          const sale = await unwrap(
            apiV2.sales.post(
              { items, discountSatang: discount, payments: [payment], shiftId, memberId, quoteId: pinned },
              withIdempotencyKey(idempotencyKey),
            ),
          )
          return sale as unknown as Sale
        }
        return unwrap(api.sales.post({ items, discountSatang: discount, payments: [payment], memberId, quoteId: pinned }))
      }),
    // Stock changed on success, and a failure usually means our cached stock or prices are stale.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: productKeys.all }),
        queryClient.invalidateQueries({ queryKey: saleKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['members'] }),
      ]),
  })
}

export const qrKeys = {
  all: ['payments', 'qr'] as const,
  config: () => [...qrKeys.all, 'config'] as const,
  detail: (id: number) => [...qrKeys.all, 'detail', id] as const,
  orderHold: (orderId: number) => [...qrKeys.all, 'order-hold', orderId] as const,
}

/** Whether the shop takes PromptPay through a bank QR that confirms itself. */
export const qrConfigQuery = queryOptions({
  queryKey: qrKeys.config(),
  queryFn: () => unwrap(api.payments.qr.config.get()),
  staleTime: 5 * 60_000,
})

/** How often the till asks whether the customer has paid. The server will not ask the bank more often itself. */
export const QR_POLL_MS = 3000

/**
 * The state of a QR while the till waits. In a shift this is the v2 "refresh" command, which asks the bank
 * and records the answer; the legacy read does the same behind a GET.
 */
export const qrPaymentQuery = (id: number, inShift = false) =>
  queryOptions({
    queryKey: qrKeys.detail(id),
    queryFn: async (): Promise<{ id: number; status: 'pending' | 'paid' | 'cancelled'; payerName: string | null }> =>
      inShift ? unwrap(apiV2.payments.qr({ id }).refresh.post()) : unwrap(api.payments.qr({ id }).get()),
  })

/** The QR that holds the price of this open order, if any. Read only; the order is locked while it is pending. */
export const orderQrHoldQuery = (orderId: number) =>
  queryOptions({
    queryKey: qrKeys.orderHold(orderId),
    queryFn: () => unwrap(apiV2.payments.qr.hold.get({ query: { orderId } })),
    refetchInterval: (query) => (query.state.data?.status === 'paid' ? false : QR_POLL_MS),
  })

export interface CreateQrInput {
  amountSatang: number
  /** The pinned price this QR is for; it is held until the QR is paid or cancelled. */
  quoteId?: number
  /** The open shift the QR is asked for. Leave out in legacy mode. */
  shiftId?: number
  idempotencyKey?: string
}

/** Asks the bank for a QR for exactly this amount. */
export function useCreateQrPayment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ amountSatang, quoteId, shiftId, idempotencyKey }: CreateQrInput): Promise<{ id: number; qrImage: string; expiresAt: Date }> => {
      if (shiftId === undefined) return unwrap(api.payments.qr.post({ amountSatang, quoteId }))
      return unwrap(
        apiV2.payments.qr.post(
          { amountSatang, shiftId, quoteId },
          withIdempotencyKey(idempotencyKey),
        ),
      )
    },
    // A lost answer leaves a request to resolve on the shift page: make it show up there at once.
    onError: () => queryClient.invalidateQueries({ queryKey: ['shifts'] }),
  })
}

export function useCancelQrPayment() {
  return useMutation({
    mutationFn: async ({ id, inShift }: { id: number; inShift: boolean }): Promise<unknown> =>
      inShift ? unwrap(apiV2.payments.qr({ id }).cancel.post()) : unwrap(api.payments.qr({ id }).cancel.post()),
  })
}
