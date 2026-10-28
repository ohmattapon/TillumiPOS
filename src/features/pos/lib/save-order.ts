/**
 * Whether the cart can be kept as an open order. An order carries no packs, so a pack line would be
 * saved as one piece at the piece price; such a cart must be paid now instead.
 */
export function canSaveAsOrder(lines: readonly { packId?: number | null }[]): boolean {
  return lines.length > 0 && lines.every((line) => line.packId === undefined || line.packId === null)
}
