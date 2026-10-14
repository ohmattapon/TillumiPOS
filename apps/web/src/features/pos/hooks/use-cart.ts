import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { modifierGroupsQuery } from '@/features/modifiers'
import { orderQuery } from '@/features/orders'
import { productsQuery } from '@/features/products'
import { useFormat, useSettings } from '@/features/settings'
import { priceCart, priceOrder } from '../lib/cart'
import { useCartStore } from '../store/cart.store'

/**
 * What the till is selling, priced against the latest product data and the shop's VAT settings:
 * the local cart (zustand) for a one-step sale, or an open order (TanStack Query) when one is chosen.
 */
export function useCart() {
  const lines = useCartStore((state) => state.lines)
  const discount = useCartStore((state) => state.discount)
  const orderId = useCartStore((state) => state.orderId)
  const clear = useCartStore((state) => state.clear)
  const products = useQuery(productsQuery())
  const order = useQuery({ ...orderQuery(orderId ?? 0), enabled: orderId !== null })
  const modifiers = useQuery(modifierGroupsQuery)
  const { vatMode, vatRateBp } = useSettings()
  const { money } = useFormat()

  // Only options that can still be chosen; a cart line with any other option is flagged as unavailable.
  const optionsById = useMemo(
    () =>
      new Map(
        (modifiers.data ?? [])
          .flatMap((group) => (group.isActive ? group.options : []))
          .filter((option) => option.isActive)
          .map((option) => [option.id, { id: option.id, name: option.name, priceSatang: option.priceSatang }] as const),
      ),
    [modifiers.data],
  )

  const productsById = useMemo(
    () => new Map((products.data ?? []).map((product) => [product.id, product])),
    [products.data],
  )

  // The order was paid or cancelled elsewhere (another till, another tab), or no longer exists.
  const gone = orderId !== null && (order.isError || (order.data !== undefined && order.data.status !== 'open'))
  useEffect(() => {
    if (gone) clear()
  }, [gone, clear])

  const priced = useMemo(() => {
    const options = { vatMode, vatRateBp, parseAmount: money.parse }
    if (orderId === null) return priceCart(lines, productsById, discount, options, optionsById)
    return priceOrder(order.data?.items ?? [], productsById, discount, options)
  }, [lines, productsById, optionsById, discount, orderId, order.data, vatMode, vatRateBp, money])

  return { ...priced, orderId, order: order.data }
}
