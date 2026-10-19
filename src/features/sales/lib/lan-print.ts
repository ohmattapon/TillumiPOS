import type { ShopSettings } from '@pos/api/types'
import type { ReceiptBitmap } from './rasterize-receipt'

/** Whether the till offers LAN printing: switched on with an address to send to. */
export function canPrintOverLan(
  settings: Pick<ShopSettings, 'receiptPrinterEnabled' | 'receiptPrinterIp'>,
): boolean {
  return settings.receiptPrinterEnabled && settings.receiptPrinterIp !== null
}

/**
 * The print body for a rasterized receipt. Always cuts, and always asks for the drawer:
 * the server applies the shop's drawer flag, so the till never decides that itself.
 */
export function lanPrintBody(
  saleId: number,
  bitmap: ReceiptBitmap,
): { saleId: number; widthDots: 384 | 576; heightDots: number; bits: boolean[]; cut: boolean; kickDrawer: boolean } {
  // Narrowed to the two printer widths: anything else never reaches the server.
  const widthDots = bitmap.widthDots === 384 ? 384 : bitmap.widthDots === 576 ? 576 : null
  if (widthDots === null) throw new Error(`Receipt bitmap must be 384 or 576 dots wide, got ${bitmap.widthDots}`)
  return {
    saleId,
    widthDots,
    heightDots: bitmap.heightDots,
    bits: bitmap.bits,
    cut: true,
    kickDrawer: true,
  }
}
