import { useQueries, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { memberQuery } from '@/features/members'
import { modifierGroupsQuery } from '@/features/modifiers'
import { orderQuery } from '@/features/orders'
import { promotionLines, useBestPromotion, useProductPromotions } from '@/features/promotions'
import { productQuery } from '@/features/products'
import { useFormat, useSettings } from '@/features/settings'
import { priceCart, priceOrder, type PricingOptions } from '../lib/cart'
import { useCartStore } from '../store/cart.store'

/**
 * What the till is selling, priced against the latest product data and the shop's VAT settings:
 * the local cart (zustand) for a one-step sale, or an open order (TanStack Query) when one is chosen.
 */
export function useCart() {
  const lines = useCartStore((state) => state.lines)
  const discount = useCartStore((state) => state.discount)
  const orderId = useCartStore((state) => state.orderId)
  const localMemberId = useCartStore((state) => state.memberId)
  const clear = useCartStore((state) => state.clear)
  const declined = useCartStore((state) => state.promotionDeclined)
  // A coupon is pinned by a quote, and a quote cannot carry a typed discount, so a typed discount
  // wins and the code waits until it is cleared.
  const storedCoupon = useCartStore((state) => state.couponCode)
  const couponCode = discount.trim() === '' ? storedCoupon : ''
  const order = useQuery({ ...orderQuery(orderId ?? 0), enabled: orderId !== null })
  const memberId = orderId === null ? localMemberId : order.data?.memberId ?? null
  const member = useQuery({ ...memberQuery(memberId ?? 0), enabled: memberId !== null, staleTime: 0, refetchInterval: 15_000 })
  const memberReady = memberId === null || (member.isSuccess && member.data.isActive)
  const ids = [...new Set((orderId === null ? lines : order.data?.items ?? []).map((line) => line.productId))]
  // The basket reads only its own products, independently of the page being browsed.
  const products = useQueries({ queries: ids.map(productQuery) })
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

  const productsById = new Map(products.flatMap((result) =>
    result.data?.isActive ? [[result.data.id, result.data] as const] : [],
  ))

  // The order was paid or cancelled elsewhere (another till, another tab), or no longer exists.
  const gone = orderId !== null && (order.isError || (order.data !== undefined && order.data.status !== 'open'))
  useEffect(() => {
    if (gone) clear()
  }, [gone, clear])

  const price = (promotion: PricingOptions['promotion']) => {
    const options: PricingOptions = { vatMode, vatRateBp, parseAmount: money.parse, promotion }
    return orderId === null
      ? priceCart(lines, productsById, discount, options, optionsById)
      : priceOrder(order.data?.items ?? [], productsById, discount, options)
  }
  // The promotion the server would give a cart this size, then the cart priced with it unless declined.
  const base = price(null)
  const cartLines = promotionLines(base.lines, productsById)
  const best = useBestPromotion({ subtotalSatang: base.subtotalSatang, hasMember: memberId !== null, lines: cartLines })
  const productPromotions = useProductPromotions(cartLines)
  const priced = best && !declined ? price(best) : base
  // A pinned price is used when a promotion applies, or when no discount is typed. A typed discount is
  // never sent with a quote (the quote would drop it), so such a cart is sold the one-step way instead.
  const usesQuote = !declined && (best !== null || base.discountSatang === 0 || couponCode !== '')

  const productsReady = products.every((result) => result.isSuccess && result.data.isActive)
  return {
    ...priced, canPay: priced.canPay && productsReady && memberReady, productsReady,
    isLoadingProducts: products.some((result) => result.isPending),
    productError: products.find((result) => result.error)?.error,
    hasUnavailableProducts: products.some((result) => result.data && !result.data.isActive),
    orderId, order: order.data, memberId, member: member.data, memberError: member.error,
    availablePromotion: best,
    productPromotions,
    promotionDeclined: declined,
    couponCode,
    usesQuote,
  }
}
