import type { DisplayQr } from '@/features/customer-display'
import type { StaticQrResolution } from './static-qr'

/**
 * Which QR the customer's screen should show, and a key that changes whenever it should be sent again.
 * A bank QR is its picture and expiry; a static PromptPay QR is its payload, which the screen draws. Never both.
 */
export function pickDisplayQr({
  bank,
  staticQr,
}: {
  bank: { id: number; image: string; expiresAt: Date } | null
  staticQr: StaticQrResolution
}): { key: string; qr: DisplayQr } | null {
  if (bank !== null) return { key: `bank:${bank.id}`, qr: { image: bank.image, expiresAt: bank.expiresAt.toISOString() } }
  if (staticQr.kind === 'ready') return { key: `static:${staticQr.payload}`, qr: { payload: staticQr.payload } }
  return null
}
