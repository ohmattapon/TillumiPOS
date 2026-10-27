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
    // A bundle cannot be written until Task 2's migration widens the enum; the create/edit API refuses the
    // kind before that, so no bundle row can exist yet, and the narrow cast only serves the type checker.
    kind: fields.kind as Exclude<typeof fields.kind, 'bundle'>,
    productIds: scope?.productIds ?? null,
    categoryIds: scope?.categoryIds ?? null,
  }
}
