import type { PointMovement, PointMovementKind } from '../../../../domains/member-points'
import type { Page } from '../../../../domains/page'

/** A movement to write on our ledger, in the unit of work of the command that caused it. */
export interface MemberPointsEntry {
  memberId: number
  kind: PointMovementKind
  /** Signed: earn and adjust add points, redeem and void_earn take them away. Never zero. */
  points: number
  saleId: number | null
  quoteId: number | null
  reason: string | null
  /** The user who caused the movement. */
  actorId: number
}

/** Our own ledger. Only it ever moves a member's balance. */
export interface IMemberPoints {
  record(entry: MemberPointsEntry): Promise<{ balanceAfter: number }>
  /** Locks the member row, so the balance cannot change between the check and the movement. */
  lockMember(memberId: number): Promise<void>
  listMovements(memberId: number, page: { limit: number; offset: number }): Promise<Page<PointMovement>>
}

const memberPointsTokenSymbol: unique symbol = Symbol('IMemberPoints')
export const memberPointsToken = memberPointsTokenSymbol.toString()
