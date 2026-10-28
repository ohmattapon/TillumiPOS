import { maxRedeemable, type PointsRule } from '@pos/api/points'

/**
 * The most points the member may spend on this cart: the bill caps it as well as the balance, and
 * an amount the shop's minimum would refuse is left out, so the "สูงสุด" button never fills in a
 * number the quote will reject.
 */
export function maxRedeemPoints(payableSatang: number, balance: number, rule: PointsRule): number {
  const max = maxRedeemable(payableSatang, balance, rule)
  return max >= rule.minRedeem ? max : 0
}

/**
 * The points the till asks the quote to redeem. A request the shop's rules would refuse counts as
 * none, which keeps the preview showing what will really be charged.
 */
export function appliedRedeemPoints(
  requested: number,
  payableSatang: number,
  balance: number,
  rule: PointsRule,
): number {
  if (requested < rule.minRedeem || requested > maxRedeemable(payableSatang, balance, rule)) return 0
  return requested
}
