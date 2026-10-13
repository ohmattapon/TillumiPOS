import { useMutation, useQueryClient } from '@tanstack/react-query'
import { productKeys } from '@/features/products'
import { saleKeys } from '@/features/sales'
import { api, unwrap } from '@/lib/api'
import type { PaymentMethod } from '@/lib/money'

export interface CheckoutInput {
  items: { productId: number; quantity: number }[]
  discountSatang: number
  payment: { method: PaymentMethod; amountSatang: number }
}

/** Records the sale. The receipt number, VAT and stock deduction are decided by the server. */
export function useCheckout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ items, discountSatang, payment }: CheckoutInput) =>
      unwrap(api.sales.post({ items, discountSatang, payments: [payment] })),
    // Stock changed on success, and a failure usually means our cached stock or prices are stale.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: productKeys.all }),
        queryClient.invalidateQueries({ queryKey: saleKeys.all }),
      ]),
  })
}
