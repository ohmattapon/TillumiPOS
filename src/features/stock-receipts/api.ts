import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { productKeys } from '@/features/products'
import { api, unwrap } from '@/lib/api'
import type { ReceiptInput } from './lib/draft'
import { withIdempotencyKey } from '@/lib/idempotency-key'

export interface StockReceipt {
  id: number; branchId: number; receivedById: number; receivedByName: string; createdAt: string; note: string | null
  items: { productId: number; sku: string; name: string; quantity: number; balanceAfter: number }[]
}
export const stockReceiptKeys = {
  all: (actorId: number) => ['stock-receipts', actorId] as const,
  list: (actorId: number, offset: number) => [...stockReceiptKeys.all(actorId), 'list', offset] as const,
  detail: (actorId: number, id: number) => [...stockReceiptKeys.all(actorId), 'detail', id] as const,
}
export const stockReceiptsQuery = (actorId: number, offset: number) => queryOptions({
  queryKey: stockReceiptKeys.list(actorId, offset),
  queryFn: () => unwrap(api.inventory.receipts.get({ query: { limit: 25, offset } })),
})
export const stockReceiptQuery = (actorId: number, id: number) => queryOptions({
  queryKey: stockReceiptKeys.detail(actorId, id),
  queryFn: () => unwrap(api.inventory.receipts({ id }).get()),
})
export function useReceiveStock(actorId: number) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ key, input }: { key: string; input: ReceiptInput }) => unwrap(api.inventory.receipts.post(input, withIdempotencyKey(key))),
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: productKeys.all }),
      client.invalidateQueries({ queryKey: stockReceiptKeys.all(actorId) }),
    ]),
  })
}
