import type { PromotionEntity } from '../../../domains/promotion.domain'

/**
 * The entity's snapshot with `weekdays` and the scope as plain mutable arrays, which Drizzle and the response
 * schemas take. The entity keeps them read-only; this only changes the type, never the values.
 */
export function snapshotOf(promotion: PromotionEntity) {
  const snapshot = promotion.toSnapshot()
  return {
    ...snapshot,
    weekdays: snapshot.weekdays === null ? null : [...snapshot.weekdays],
    scope: snapshot.scope === null ? null : { productIds: [...snapshot.scope.productIds], categoryIds: [...snapshot.scope.categoryIds] },
  }
}

/** The columns a promotion is stored in: the scope is two id arrays, both null for the whole bill. */
export function rowOf(promotion: PromotionEntity) {
  const { scope, ...fields } = snapshotOf(promotion)
  return {
    ...fields,
    productIds: scope?.productIds ?? null,
    categoryIds: scope?.categoryIds ?? null,
  }
}
