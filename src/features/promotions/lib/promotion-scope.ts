/** The products and categories chosen in the promotion form; both empty means the whole bill. */
export interface ScopeSelection {
  productIds: number[]
  categoryIds: number[]
}

export const emptyScope: ScopeSelection = { productIds: [], categoryIds: [] }

const sortedUnique = (ids: readonly number[]) => [...new Set(ids)].sort((a, b) => a - b)

/** What the API takes: sorted ids, or null for the whole bill. */
export function scopeToBody(selection: ScopeSelection): ScopeSelection | null {
  if (selection.productIds.length === 0 && selection.categoryIds.length === 0) return null
  return { productIds: sortedUnique(selection.productIds), categoryIds: sortedUnique(selection.categoryIds) }
}

export function scopeOf(promotion: { scope: { productIds: readonly number[]; categoryIds: readonly number[] } | null }): ScopeSelection {
  return promotion.scope
    ? { productIds: [...promotion.scope.productIds], categoryIds: [...promotion.scope.categoryIds] }
    : { productIds: [], categoryIds: [] }
}

export function toggleId(ids: readonly number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((chosen) => chosen !== id) : [...ids, id]
}

export type ScopeEntryStatus = 'active' | 'inactive' | 'missing' | 'loading'

/**
 * The chosen ids with what is known of them. The scope has no foreign key, so a product or category
 * switched off or gone since stays chosen: it is listed with its state so the owner can take it out.
 */
export function scopeEntries(
  ids: readonly number[],
  known: ReadonlyMap<number, { name: string; isActive: boolean }>,
  loading: ReadonlySet<number> = new Set(),
): { id: number; name: string | null; status: ScopeEntryStatus }[] {
  return ids.map((id) => {
    const item = known.get(id)
    if (!item) return { id, name: null, status: loading.has(id) ? 'loading' : 'missing' }
    return { id, name: item.name, status: item.isActive ? 'active' : 'inactive' }
  })
}
