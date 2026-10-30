import { isShopUrl } from './shop-origin'

/**
 * True only for the top frame of a page on the shop origin. A child iframe is refused even
 * when it is on the shop origin, because a page the shop embeds is not the shop.
 */
export function isTrustedSender(shopOrigin: string, frameUrl: string, isMainFrame: boolean): boolean {
  return isMainFrame && isShopUrl(shopOrigin, frameUrl)
}

/** The part of an Electron IPC event that the trust check reads. */
export interface SenderEvent {
  // null when the frame is already gone, which Electron reports for a late message.
  senderFrame: { url: string; parent: unknown } | null
}

/** Applies `isTrustedSender` to a real IPC event; a missing frame is never trusted. */
export function eventIsTrusted(shopOrigin: string, event: SenderEvent): boolean {
  const frame = event.senderFrame
  if (!frame) return false
  return isTrustedSender(shopOrigin, frame.url, frame.parent === null)
}
