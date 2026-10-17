import type { PromotionEntity } from '../../../domains/promotion.domain'

/**
 * The entity's snapshot with `weekdays` as a plain mutable array, which Drizzle and the response schemas
 * take. The entity keeps the days read-only; this only changes the type, never the values.
 */
export function snapshotOf(promotion: PromotionEntity) {
  const snapshot = promotion.toSnapshot()
  return { ...snapshot, weekdays: snapshot.weekdays === null ? null : [...snapshot.weekdays] }
}
