/** The quote a QR holds, when the server refused a sale because it left that quote out. */
export function heldQuoteOf(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null
  const { code, params } = error as { code?: unknown; params?: { quoteId?: unknown } }
  return code === 'QUOTE_REQUIRED' && typeof params?.quoteId === 'number' ? params.quoteId : null
}

/**
 * Money that arrived for a QR made from a pinned price has to be sold with that price. The till may not
 * have it any more (the page was reloaded, or another till made the QR); the server names it, and the
 * sale is tried once more with it.
 */
export async function withHeldQuote<T>(
  quoteId: number | undefined,
  run: (quoteId: number | undefined) => Promise<T>,
): Promise<T> {
  try {
    return await run(quoteId)
  } catch (error) {
    const held = quoteId === undefined ? heldQuoteOf(error) : null
    if (held === null) throw error
    return run(held)
  }
}
