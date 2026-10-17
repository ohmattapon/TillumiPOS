/** Number of category tones defined as `--category-1` … `--category-8` in `index.css`. */
export const CATEGORY_TONES = 8

/**
 * The colour of a category, worked out from its id so it needs no setting and stays the same on every screen.
 * Ids are handed out in order, so the first eight categories never share a colour.
 */
export function categoryColor(categoryId: number): string {
  const tone = (((Math.trunc(categoryId) - 1) % CATEGORY_TONES) + CATEGORY_TONES) % CATEGORY_TONES + 1
  return `var(--category-${tone})`
}
