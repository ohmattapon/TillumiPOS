import { pickBestPromotion } from '@pos/api/promotions'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useSettings } from '@/features/settings'
import { activePromotionsQuery } from '../api'

/**
 * The promotion the server will most likely give a cart of this size, worked out with the same rule the
 * server uses. It only shows the cashier what to expect: the server chooses again when the price is pinned.
 */
export function useBestPromotion({ subtotalSatang, hasMember }: { subtotalSatang: number; hasMember: boolean }) {
  const promotions = useQuery(activePromotionsQuery)
  const { timeZone } = useSettings()
  // Windows open and close during the day, so the answer is worked out again every so often.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  return useMemo(() => {
    const best = pickBestPromotion(promotions.data?.items ?? [], { subtotalSatang, hasMember, at: now, timeZone })
    return best ? { id: best.promotion.id, name: best.promotion.name, discountSatang: best.discountSatang } : null
  }, [promotions.data, subtotalSatang, hasMember, now, timeZone])
}
