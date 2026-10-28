import { promotionsFor } from '@pos/api/promotions'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useSettings } from '@/features/settings'
import { activePromotionsQuery } from '../api'
import { promotionRulesOfAll } from '../lib/promotion-rules'

export interface ProductPromotion {
  id: number
  name: string
  minSubtotalSatang: number
  membersOnly: boolean
}

/**
 * The running promotions limited to each product in the cart, keyed by product id, for a short note on its
 * line. Only for the cashier to see: what the bill actually gets is still chosen by the server.
 */
export function useProductPromotions(items: readonly { productId: number; categoryId: number | null }[]) {
  const promotions = useQuery(activePromotionsQuery)
  const { timeZone } = useSettings()
  // Windows open and close during the day, so the answer is worked out again every so often.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])
  const byProduct = new Map<number, ProductPromotion[]>()
  for (const item of items) {
    if (byProduct.has(item.productId)) continue
    const found = promotionsFor(promotionRulesOfAll(promotions.data?.items ?? []), item, now, timeZone)
    if (found.length > 0)
      byProduct.set(item.productId, found.map((promotion) => ({
        id: promotion.id,
        name: promotion.name,
        minSubtotalSatang: promotion.minSubtotalSatang,
        membersOnly: promotion.audience === 'members',
      })))
  }
  return byProduct
}
