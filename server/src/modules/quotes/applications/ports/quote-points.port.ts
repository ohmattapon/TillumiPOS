import type { PointMovementKind } from '../../../../domains/member-points'

/** A movement a quote writes on a member's ledger, in the unit of work of the command that caused it. */
export interface QuotePointEntry {
  memberId: number
  kind: PointMovementKind
  /** Signed: redeem takes points away, void_redeem gives them back. Never zero. */
  points: number
  saleId: number | null
  quoteId: number | null
  reason: string | null
  /** The user who caused the movement. */
  actorId: number
}

/** The points a cart pins and holds while a QR waits. Owned here, answered by the members module. */
export interface IQuotePoints {
  balanceOf(memberId: number): Promise<number>
  /** Locks the member row, so the balance cannot change between the check and the movement. */
  lockMember(memberId: number): Promise<void>
  record(entry: QuotePointEntry): Promise<{ balanceAfter: number }>
  /** The points this quote is holding right now, or null when it holds none. */
  findQuoteRedemption(quoteId: number): Promise<number | null>
}

const quotePointsTokenSymbol: unique symbol = Symbol('IQuotePoints')
export const quotePointsToken = quotePointsTokenSymbol.toString()
