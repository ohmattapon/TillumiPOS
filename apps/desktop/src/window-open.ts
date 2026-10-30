import { navigationDecision } from './shop-origin'

/**
 * What to do when a page asks for a new window:
 * allow-popup = open it as an app window (same origin as the shop only, e.g. the customer display),
 * external = hand it to the system browser, deny = drop it.
 * It reuses `navigationDecision`, so a new window follows exactly the rule a navigation does.
 */
export type WindowOpenDecision = 'allow-popup' | 'external' | 'deny'

export function windowOpenDecision(shopOrigin: string, url: string): WindowOpenDecision {
  const decision = navigationDecision(shopOrigin, url)
  return decision === 'allow' ? 'allow-popup' : decision
}
