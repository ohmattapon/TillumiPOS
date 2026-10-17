/**
 * How VAT relates to the prices on the shelf.
 *
 * - inclusive: prices already contain VAT; VAT is extracted from the total.
 * - exclusive: prices exclude VAT; VAT is added on top.
 * - none: the shop does not charge VAT.
 */
export const VAT_MODES = ['inclusive', 'exclusive', 'none'] as const
export type VatMode = (typeof VAT_MODES)[number]

export interface TotalsInput {
  /** Sum of the lines, in minor currency units. */
  subtotalSatang: number
  /** Must not exceed the subtotal; validate before calling. */
  discountSatang: number
  vatMode: VatMode
  /** Basis points: 700 = 7%. */
  vatRateBp: number
}

export interface Totals {
  /** VAT contained in (inclusive) or added to (exclusive) the total. */
  vatSatang: number
  /** What the customer owes. */
  totalSatang: number
}

/**
 * The one pricing rule, shared by the server and the till so the amount shown
 * on screen is exactly the amount the server will charge. All amounts are integers.
 */
export function calculateTotals({ subtotalSatang, discountSatang, vatMode, vatRateBp }: TotalsInput): Totals {
  const net = subtotalSatang - discountSatang

  if (vatMode === 'exclusive') {
    const vatSatang = Math.round((net * vatRateBp) / 10_000)
    return { vatSatang, totalSatang: net + vatSatang }
  }
  if (vatMode === 'inclusive')
    return { vatSatang: Math.round((net * vatRateBp) / (10_000 + vatRateBp)), totalSatang: net }

  return { vatSatang: 0, totalSatang: net }
}
