import { describe, expect, test } from 'bun:test'
import { heldQuoteOf, withHeldQuote } from './held-quote'

const heldBy = (quoteId: number) => Object.assign(new Error('x'), { code: 'QUOTE_REQUIRED', params: { quoteId } })

describe('heldQuoteOf', () => {
  test('reads the quote a refused sale has to carry', () => {
    expect(heldQuoteOf(heldBy(7))).toBe(7)
  })

  test('is null for any other error', () => {
    expect(heldQuoteOf(new Error('x'))).toBeNull()
    expect(heldQuoteOf(Object.assign(new Error('x'), { code: 'QUOTE_MISMATCH', params: { quoteId: 7 } }))).toBeNull()
    expect(heldQuoteOf(Object.assign(new Error('x'), { code: 'QUOTE_REQUIRED' }))).toBeNull()
    expect(heldQuoteOf(null)).toBeNull()
  })
})

describe('withHeldQuote', () => {
  test('returns the answer of the first try', async () => {
    const calls: (number | undefined)[] = []
    const result = await withHeldQuote(undefined, async (quoteId) => { calls.push(quoteId); return 'sale' })
    expect(result).toBe('sale')
    expect(calls).toEqual([undefined])
  })

  test('tries once more with the quote the server named', async () => {
    const calls: (number | undefined)[] = []
    const result = await withHeldQuote(undefined, async (quoteId) => {
      calls.push(quoteId)
      if (quoteId === undefined) throw heldBy(7)
      return 'sale'
    })
    expect(result).toBe('sale')
    expect(calls).toEqual([undefined, 7])
  })

  test('does not retry when a quote was already sent, and passes other errors on', async () => {
    let calls = 0
    await expect(withHeldQuote(3, async () => { calls++; throw heldBy(7) })).rejects.toThrow('x')
    await expect(withHeldQuote(undefined, async () => { calls++; throw new Error('other') })).rejects.toThrow('other')
    expect(calls).toBe(2)
  })

  test('gives up when the second try is refused too', async () => {
    let calls = 0
    await expect(withHeldQuote(undefined, async () => { calls++; throw heldBy(7) })).rejects.toThrow('x')
    expect(calls).toBe(2)
  })
})
