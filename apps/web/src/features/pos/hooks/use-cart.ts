import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { productsQuery } from '@/features/products'
import { priceCart } from '../lib/cart'
import { useCartStore } from '../store/cart.store'

/** The cart priced against the latest product data: client state (zustand) joined with server state (TanStack Query). */
export function useCart() {
  const lines = useCartStore((state) => state.lines)
  const discount = useCartStore((state) => state.discount)
  const products = useQuery(productsQuery())

  const productsById = useMemo(
    () => new Map((products.data ?? []).map((product) => [product.id, product])),
    [products.data],
  )

  return useMemo(() => priceCart(lines, productsById, discount), [lines, productsById, discount])
}
