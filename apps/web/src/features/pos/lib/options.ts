import { resolveLineOptions, type ModifierGroupWithOptions, type ResolvedLineOptions } from '@pos/api/modifiers'
import type { ModifierGroup } from '@pos/api/types'

/**
 * The groups the till asks about when this product is sold: active groups with at least one active
 * option, and only the options that can be chosen. A product with none is added without asking.
 */
export function offeredGroups(groups: readonly ModifierGroup[], productId: number): ModifierGroup[] {
  return groups
    .filter((group) => group.isActive && group.productIds.includes(productId))
    .map((group) => ({ ...group, options: group.options.filter((option) => option.isActive) }))
    .filter((group) => group.options.length > 0)
}

/** The server's rule, applied here so the dialog and the server never disagree. Null when it is not allowed. */
export function chooseOptions(groups: readonly ModifierGroup[], optionIds: readonly number[]): ResolvedLineOptions | null {
  const withOptions: ModifierGroupWithOptions[] = groups.map((group) => ({ group, options: group.options }))
  try {
    return resolveLineOptions(withOptions, optionIds)
  } catch {
    return null
  }
}
