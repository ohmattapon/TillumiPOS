export interface SearchableItem {
  label: string
  /** A second line worth searching, such as a SKU. */
  hint?: string
}

/** Items whose label or hint contains every word typed, ignoring case; no words keeps them all. */
export function filterItems<T extends SearchableItem>(items: readonly T[], query: string): T[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...items]
  return items.filter((item) => {
    const text = `${item.label} ${item.hint ?? ''}`.toLocaleLowerCase()
    return words.every((word) => text.includes(word))
  })
}

export type ListKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End'

/** The highlighted row after a key: arrows wrap around, and nothing is highlighted in an empty list (-1). */
export function nextActiveIndex(current: number, count: number, key: ListKey): number {
  if (count === 0) return -1
  switch (key) {
    case 'Home':
      return 0
    case 'End':
      return count - 1
    case 'ArrowDown':
      return current < 0 || current >= count - 1 ? 0 : current + 1
    case 'ArrowUp':
      return current <= 0 ? count - 1 : current - 1
  }
}
