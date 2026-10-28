import type { PointMovementKind } from '../../../../domains/member-points'

/** A movement to write on a member's ledger, in the unit of work of the command that caused it. */
export interface PointMovementEntry {
  memberId: number
  kind: PointMovementKind
  /** Signed: earn adds points, redeem and void_earn take them away. Never zero. */
  points: number
  saleId: number | null
  quoteId: number | null
  reason: string | null
  /** The user who caused the movement. */
  actorId: number
}

/** The points a bill gives, takes and holds. Owned here, answered by the members module. */
export interface ICheckoutPoints {
  balanceOf(memberId: number): Promise<number>
  /** Locks the member row, so the balance cannot change between the check and the movement. */
  lockMember(memberId: number): Promise<void>
  record(entry: PointMovementEntry): Promise<{ balanceAfter: number }>
  /** The points a QR reserved by this quote already took from the member, or null when it took none. */
  findQuoteRedemption(quoteId: number): Promise<number | null>
}

const checkoutPointsTokenSymbol: unique symbol = Symbol('ICheckoutPoints')
export const checkoutPointsToken = checkoutPointsTokenSymbol.toString()
