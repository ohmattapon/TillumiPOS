/** Transient input stays local; only a complete positive integer reaches the draft. */
export function receiptQuantity(text: string): number | null {
  if (!/^\d+$/.test(text)) return null
  const quantity = Number(text)
  return Number.isInteger(quantity) && quantity > 0 && quantity <= 2147483647 ? quantity : null
}
