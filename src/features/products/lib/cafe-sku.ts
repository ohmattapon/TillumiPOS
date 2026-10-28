/**
 * The shape of an automatically numbered café code: CAFE- followed by a number.
 * A code that does not fit (the old starter set used CAFE-ESP-HOT) is ignored.
 */
const CAFE_SKU_NUMBER = /^CAFE-(\d+)$/i

/** The prefix every automatic café code carries. */
export const CAFE_SKU_PREFIX = 'CAFE-'

/** Enough codes for any real shop; the server still refuses a duplicate with 409. */
export const CAFE_SKU_SCAN_LIMIT = 1000

/**
 * The next free CAFE-### code, zero padded to three digits. Every number already
 * taken is skipped, whatever the case of the code in the list. The shop's own
 * unique constraint stays the authority, so this only offers a starting value.
 */
export function nextCafeSku(existingSkus: string[]): string {
  const taken = new Set<number>()
  for (const sku of existingSkus) {
    const match = CAFE_SKU_NUMBER.exec(sku.trim())
    if (match) taken.add(Number(match[1]))
  }
  let number = 1
  while (taken.has(number)) number++
  return `${CAFE_SKU_PREFIX}${String(number).padStart(3, '0')}`
}
