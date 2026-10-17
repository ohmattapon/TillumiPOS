import type { VatMode } from '@pos/api/pricing'
import type { DisplayQr, DisplayState } from '@/features/customer-display'
import type { PricedCart } from './cart'

export interface CustomerDisplayInput {
  /** What the till is selling, already priced: the same figures the receipt will carry. */
  cart: Pick<PricedCart, 'lines' | 'subtotalSatang' | 'discountSatang' | 'vatSatang' | 'totalSatang'>
  vatMode: VatMode
  /** The payment dialog is open. */
  isPaying: boolean
  /** The bank QR the customer can scan right now, if there is one. */
  qr: DisplayQr | null
  /** A sale was just recorded and is still inside the few seconds "paid" is shown. */
  paidSale: { totalSatang: number; changeSatang: number } | null
}

/**
 * What the customer's screen should show. A sale in progress always wins over "paid", so a customer who
 * walks up while the last "thank you" is still showing sees their own basket, not the previous one.
 * Only receipt-level facts are copied: no product ids, stock or cost.
 */
export function toDisplayState({ cart, vatMode, isPaying, qr, paidSale }: CustomerDisplayInput): DisplayState {
  if (cart.lines.length > 0) {
    const lines = cart.lines.map((line) => ({
      name: line.name,
      options: line.options.map((option) => option.name),
      quantity: line.quantity,
      lineTotalSatang: line.lineTotalSatang,
    }))
    if (isPaying) return { kind: 'paying', lines, totalSatang: cart.totalSatang, qr }
    return {
      kind: 'selling',
      lines,
      subtotalSatang: cart.subtotalSatang,
      discountSatang: cart.discountSatang,
      vatSatang: cart.vatSatang,
      vatMode,
      totalSatang: cart.totalSatang,
    }
  }
  if (paidSale !== null) return { kind: 'paid', ...paidSale }
  return { kind: 'idle' }
}
