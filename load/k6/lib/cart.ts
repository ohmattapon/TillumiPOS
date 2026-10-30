// What a till sells: one to four ordinary products, one to three of each. Pure, and fed by a VU-local generator,
// so the same seed gives the same carts on every run.
import type { SeededData } from '../../seed.ts'

export interface CartLine {
  productId: number
  quantity: number
}

export interface Cart {
  items: CartLine[]
  totalHint?: number
}

const MAX_LINES = 4
const MAX_QUANTITY = 3

/**
 * A cart of distinct products from `productIds`. The hot products stay out: they hold 1 to 20 pieces and are for
 * the contention scenario, so a sale here never runs a shared product dry.
 */
export function pickCart(rand: () => number, seed: Pick<SeededData, 'productIds'>): Cart {
  const pool = seed.productIds
  if (pool.length === 0) throw new Error('The seed has no ordinary products to sell')
  const lineCount = Math.min(1 + Math.floor(rand() * MAX_LINES), pool.length)
  const chosen = new Set<number>()
  const items: CartLine[] = []
  while (items.length < lineCount) {
    const productId = pool[Math.floor(rand() * pool.length)]!
    if (chosen.has(productId)) continue
    chosen.add(productId)
    items.push({ productId, quantity: 1 + Math.floor(rand() * MAX_QUANTITY) })
  }
  return { items }
}

/**
 * A product for an extra order line that is never one already in the cart: the same product would merge into that
 * line and change its quantity, and splitting off a line that is the whole order is refused.
 */
export function pickExtraProduct(rand: () => number, seed: Pick<SeededData, 'productIds'>, cart: Cart): number {
  const inCart = new Set(cart.items.map((item) => item.productId))
  const candidates = seed.productIds.filter((id) => !inCart.has(id))
  if (candidates.length === 0) throw new Error('The seed has no product left outside the cart')
  return candidates[Math.floor(rand() * candidates.length)]!
}
