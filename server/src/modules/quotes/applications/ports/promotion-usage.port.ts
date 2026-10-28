import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import type { PromotionRules } from '../../../../domains/promotion.domain'

/** How many times a promotion has been used: in total, and by one member when the caller named one. */
export interface PromotionUseCounts {
  total: number
  byMember: number
}

/** The limits that decide whether a promotion still has a slot. */
export type PromotionUseLimits = Pick<PromotionRules, 'maxUses' | 'maxUsesPerMember'>

export interface IPromotionUsage {
  /**
   * Completed (not voided) sales plus quotes reserved by a QR, for the promotion; `byMember` counts the
   * member `memberId` only when one is given. Runs inside the caller's unit of work.
   */
  countUses(promotionId: number, memberId: number | null): Promise<PromotionUseCounts>
  /** The same counts of several promotions at once, for a list response; ids left out read as unused. */
  countMany(promotionIds: readonly number[]): Promise<Map<number, PromotionUseCounts>>
  /**
   * Row-locks the promotion until the unit of work ends and answers its limits as they are now, or null
   * when the promotion has none. The answer comes from the locked row itself, so a limit the shop edited
   * after a quote was pinned still governs, and no limit enters a receipt.
   */
  lockForUse(promotionId: number): Promise<PromotionUseLimits | null>
}

/** The promotion was limited and every slot it had is spent. */
export const promotionLimitReached = () =>
  new DomainConflictError('โปรโมชันนี้ถูกใช้ครบจำนวนครั้งที่กำหนดแล้ว', 'PROMOTION_LIMIT_REACHED')

const token: unique symbol = Symbol('IPromotionUsage')
export const promotionUsageToken = token.toString()
