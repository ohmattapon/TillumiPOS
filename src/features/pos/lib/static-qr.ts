import { buildPromptPayPayload } from '@pos/api/promptpay-qr'

export type StaticQrResolution =
  /** A local QR can be shown: the payload carries the bill amount. No bank call is made. */
  | { kind: 'ready'; payload: string }
  /** Static mode is on but no usable target is configured: warn, do not fall back to the bank. */
  | { kind: 'missing-target' }
  /** Not in static mode: the bank flow (or the trust fallback) behaves exactly as before. */
  | { kind: 'off' }

interface StaticQrSettings {
  promptpayMode?: string | null
  promptpayTarget?: string | null
}

/**
 * Decides whether the till shows a locally-built PromptPay QR for this bill.
 * Pure: the dialog renders from the returned value and never copies settings into a store.
 * A malformed target is treated like a missing one (a warning), never a thrown error,
 * so a bad shop setting cannot crash the payment dialog.
 */
export function resolveStaticQr(settings: StaticQrSettings | undefined | null, totalSatang: number): StaticQrResolution {
  if (settings?.promptpayMode !== 'static') return { kind: 'off' }
  const target = (settings.promptpayTarget ?? '').trim()
  if (!target) return { kind: 'missing-target' }
  try {
    return { kind: 'ready', payload: buildPromptPayPayload(target, totalSatang) }
  } catch {
    return { kind: 'missing-target' }
  }
}
