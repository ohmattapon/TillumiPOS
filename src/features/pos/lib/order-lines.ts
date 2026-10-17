/** Packs are sold at the till only; an order line has no pack, so a cart holding one cannot become an order. */
export const hasPackLines = (lines: readonly { packId: number | null }[]) => lines.some((line) => line.packId !== null)
