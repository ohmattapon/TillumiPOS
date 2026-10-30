import type { RenderProcessGoneDetails } from 'electron'

/**
 * A page whose renderer died stays blank until it is loaded again. A clean exit is the window
 * closing on purpose, so only the other reasons (crash, kill, out of memory) bring the shop back.
 */
export function shouldReopenShop(reason: RenderProcessGoneDetails['reason']): boolean {
  return reason !== 'clean-exit'
}
