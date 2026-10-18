import type { Product } from '@pos/api/types'
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { modifierKeys } from '@/features/modifiers'
import { api, apiV2, unwrap } from '@/lib/api'
import { prepareImage } from './lib/image'

export const productKeys = {
  /** Prefix of every product query: invalidate this after anything that changes products or stock. */
  all: ['products'] as const,
  list: (filters: ProductListFilters) => [...productKeys.all, 'list', filters] as const,
  detail: (id: number) => [...productKeys.all, 'detail', id] as const,
}

export interface ProductListFilters {
  productType?: Product['productType']
  q?: string
  code?: string
  categoryId?: number
  includeInactive?: boolean
  isActive?: boolean
  stockAtMost?: number
  sort?: 'name' | 'stock'
  limit?: number
  offset?: number
}

/** Filter on the server before applying the page boundary; no catalogue-size cap in the browser. */
export const productsQuery = (filters: ProductListFilters = {}) =>
  queryOptions({
    queryKey: productKeys.list(filters),
    queryFn: () => unwrap(api.catalog.products.get({ query: { limit: 20, offset: 0, ...filters } })),
  })

export const productQuery = (id: number) => queryOptions({
  queryKey: productKeys.detail(id),
  queryFn: () => unwrap(api.catalog.products({ id }).get()),
})

/** Whether this shop has a place to keep product images: the upload is hidden when it has not. */
export const imageStorageQuery = queryOptions({
  queryKey: ['capabilities', 'image-storage'] as const,
  queryFn: async () => (await unwrap(apiV2.capabilities.get())).imageStorage,
  staleTime: Infinity,
})

export interface ProductInput {
  productType: Product['productType']
  sku?: string
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
  /** The option groups offered on the product; undefined leaves them as they are. */
  modifierGroupIds?: number[]
}

/** Creates or updates a product, then applies the image change, which needs the product's id. */
export function useSaveProduct() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, input, image, modifierGroupIds }: SaveProductVariables): Promise<Product> => {
      const saved = await unwrap(
        id === undefined ? api.catalog.products.post(input) : api.catalog.products({ id }).patch(input),
      )
      if (modifierGroupIds !== undefined)
        await unwrap(api.catalog.products({ id: saved.id })['modifier-groups'].put({ groupIds: modifierGroupIds }))
      if (image) return unwrap(api.catalog.products({ id: saved.id }).image.put({ file: await prepareImage(image) }))
      if (image === null && saved.imageUrl) return unwrap(api.catalog.products({ id: saved.id }).image.delete())
      return saved
    },
    // Even when the image step fails the product itself was saved, so the list must refresh either way.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: productKeys.all }),
        queryClient.invalidateQueries({ queryKey: modifierKeys.all }),
      ]),
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
