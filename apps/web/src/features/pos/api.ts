import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { productKeys } from '@/features/products'
import { saleKeys } from '@/features/sales'
import type { Sale } from '@pos/api/types'
import { api, apiV2, unwrap } from '@/lib/api'
import type { PaymentInput } from '@/lib/money'

export interface CheckoutInput {
  items: { productId: number; quantity: number }[]
  discountSatang: number
  payment: PaymentInput
  shiftId?: number
  idempotencyKey?: string
}

/** Records the sale. The receipt number, VAT and stock deduction are decided by the server. */
export function useCheckout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ items, discountSatang, payment, shiftId, idempotencyKey }: CheckoutInput): Promise<Sale> => {
      if (shiftId !== undefined) {
        const sale = await unwrap(apiV2.sales.post({ items, discountSatang, payments: [payment], shiftId }, { headers: { 'idempotency-key': idempotencyKey ?? crypto.randomUUID() } }))
        return sale as unknown as Sale
      }
      return unwrap(api.sales.post({ items, discountSatang, payments: [payment] }))
    },
    // Stock changed on success, and a failure usually means our cached stock or prices are stale.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: productKeys.all }),
        queryClient.invalidateQueries({ queryKey: saleKeys.all }),
      ]),
  })
}

export const qrKeys = {
  all: ['payments', 'qr'] as const,
  config: () => [...qrKeys.all, 'config'] as const,
  detail: (id: number) => [...qrKeys.all, 'detail', id] as const,
}

/** Whether the shop takes PromptPay through a bank QR that confirms itself. */
export const qrConfigQuery = queryOptions({
  queryKey: qrKeys.config(),
  queryFn: () => unwrap(api.payments.qr.config.get()),
  staleTime: 5 * 60_000,
})

/** How often the till asks whether the customer has paid. The server will not ask the bank more often itself. */
export const QR_POLL_MS = 3000

export const qrPaymentQuery = (id: number) =>
  queryOptions({
    queryKey: qrKeys.detail(id),
    queryFn: () => unwrap(api.payments.qr({ id }).get()),
  })

/** Asks the bank for a QR for exactly this amount. */
export function useCreateQrPayment() {
  return useMutation({
    mutationFn: (amountSatang: number) => unwrap(api.payments.qr.post({ amountSatang })),
  })
}

export function useCancelQrPayment() {
  return useMutation({
    mutationFn: (id: number) => unwrap(api.payments.qr({ id }).cancel.post()),
  })
}
