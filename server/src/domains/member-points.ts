import { DomainError } from './errors/domain-error'

/**
 * The shop's earning and redemption rate. One rule governs every bill, so a
 * member can work out what a point is worth without asking the till.
 */
export interface PointsRule {
  /** Satang a member must pay to earn one point. */
  earnSatang: number
  /** Satang one redeemed point takes off the bill. */
  redeemSatang: number
  /** Fewest points that may be redeemed in one bill. */
  minRedeem: number
}

export const POINT_MOVEMENT_KINDS = [
  'earn',
  'redeem',
  'void_earn',
  'void_redeem',
  'adjust',
] as const

export type PointMovementKind = (typeof POINT_MOVEMENT_KINDS)[number]

/** One row of the ledger, as a member's history shows it. */
export interface PointMovement {
  id: number
  kind: PointMovementKind
  /** Signed: earn and adjust add points, redeem and void_earn take them away. */
  points: number
  saleId: number | null
  quoteId: number | null
  reason: string | null
  actorId: number
  createdAt: Date
}

export function assertValidPointsRule(rule: PointsRule): void {
  const values = [rule.earnSatang, rule.redeemSatang, rule.minRedeem]
  if (!values.every((value) => Number.isInteger(value)))
    throw new DomainError('อัตราแต้มต้องเป็นจำนวนเต็ม', 'INVALID_SETTINGS')
  if (rule.earnSatang < 100)
    throw new DomainError('ยอดที่ต้องจ่ายเพื่อได้หนึ่งแต้มต้องไม่ต่ำกว่า 1 บาท', 'INVALID_SETTINGS')
  if (rule.redeemSatang < 1)
    throw new DomainError('มูลค่าของหนึ่งแต้มต้องมากกว่าศูนย์', 'INVALID_SETTINGS')
  if (rule.minRedeem < 1)
    throw new DomainError('จำนวนแต้มขั้นต่ำที่แลกได้ต้องมากกว่าศูนย์', 'INVALID_SETTINGS')
}

/** Points a bill earns: one for every full slice of the earn rate, never negative. */
export function pointsEarned(totalSatang: number, rule: PointsRule): number {
  if (totalSatang <= 0) return 0
  return Math.floor(totalSatang / rule.earnSatang)
}

/** Most points this bill can take off, bounded by what the bill can absorb and the balance. */
export function maxRedeemable(
  payableSatang: number,
  balance: number,
  rule: PointsRule,
): number {
  const byPayable = Math.floor(Math.max(0, payableSatang) / rule.redeemSatang)
  return Math.max(0, Math.min(balance, byPayable))
}

export function pointsDiscountSatang(points: number, rule: PointsRule): number {
  return points * rule.redeemSatang
}

export function assertRedeemable(
  points: number,
  payableSatang: number,
  balance: number,
  rule: PointsRule,
): void {
  if (points === 0) return
  const max = maxRedeemable(payableSatang, balance, rule)
  const outOfRange = `แลกแต้มได้ตั้งแต่ ${rule.minRedeem} ถึง ${max} แต้ม`
  if (points < 0 || points < rule.minRedeem)
    throw new DomainError(outOfRange, 'POINTS_REDEEM_INVALID', { min: rule.minRedeem, max })
  if (points > balance)
    throw new DomainError(`แต้มคงเหลือมี ${balance} แต้ม`, 'POINTS_NOT_ENOUGH', { balance })
  if (points > max) throw new DomainError(outOfRange, 'POINTS_REDEEM_INVALID', { min: rule.minRedeem, max })
}

/**
 * Points to take back when a bill is voided. What the member already spent is
 * not clawed back, so the shortfall is reported instead of driving the balance
 * below zero.
 */
export function voidEarnPoints(earned: number, balance: number): { points: number; shortfall: number } {
  const taken = Math.min(Math.max(0, earned), Math.max(0, balance))
  return { points: -taken, shortfall: Math.max(0, earned - balance) }
}
