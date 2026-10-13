import type { Product } from '@pos/api/types'
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'
import { prepareImage } from './lib/image'

export const productKeys = {
  /** Prefix of every product query: invalidate this after anything that changes products or stock. */
  all: ['products'] as const,
  list: (includeInactive: boolean) => [...productKeys.all, 'list', { includeInactive }] as const,
}

/** Every product in one request: a shop's catalogue is small enough to search and filter in the browser. */
export const productsQuery = (includeInactive = false) =>
  queryOptions({
    queryKey: productKeys.list(includeInactive),
    queryFn: async () => (await unwrap(api.catalog.products.get({ query: { includeInactive, limit: 1000 } }))).items,
  })

export interface ProductInput {
  sku: string
  name: string
  barcode: string | null
  categoryId: number | null
  priceSatang: number
  costSatang: number
  trackStock: boolean
}

export interface SaveProductVariables {
  /** Omit to create a new product. */
  id?: number
  input: ProductInput
  /** undefined keeps the current image, null removes it, a File replaces it. */
  image: File | null | undefined
}

/** Creates or updates a product, then applies the image change, which needs the product's id. */
export function useSaveProduct() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, input, image }: SaveProductVariables): Promise<Product> => {
      const saved = await unwrap(
        id === undefined ? api.catalog.products.post(input) : api.catalog.products({ id }).patch(input),
      )
      if (image) return unwrap(api.catalog.products({ id: saved.id }).image.put({ file: await prepareImage(image) }))
      if (image === null && saved.imageUrl) return unwrap(api.catalog.products({ id: saved.id }).image.delete())
      return saved
    },
    // Even when the image step fails the product itself was saved, so the list must refresh either way.
    onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.all }),
  })
}

export function useSetProductActive() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      unwrap(api.catalog.products({ id }).patch({ isActive })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productKeys.all }),
  })
}

export type StockChange =
  | { mode: 'receive'; productId: number; quantity: number; note?: string }
  | { mode: 'adjust'; productId: number; countedQty: number; note?: string }

/** Receives stock or records a stock count. */
export function useChangeStock() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (change: StockChange) =>
      unwrap(
        change.mode === 'receive'
          ? api.inventory.receive.post({ productId: change.productId, quantity: change.quantity, note: change.note })
          : api.inventory.adjust.post({ productId: change.productId, countedQty: change.countedQty, note: change.note }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productKeys.all }),
  })
}
