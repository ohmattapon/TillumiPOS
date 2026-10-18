import { describe, expect, it } from 'bun:test'
import { ReceiptDraftStore, type DraftStorage } from './draft'

function setup() {
  const data = new Map<string, string>()
  const storage: DraftStorage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) } }
  let next = 0
  return { data, storage, open: (actor = 1) => new ReceiptDraftStore(actor, storage, () => `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`) }
}

describe('durable receipt draft', () => {
  it('persists the latest unsent edit synchronously so an immediate reload restores it', () => {
    const env = setup(), draft = env.open()
    draft.add(5)
    draft.quantity(5, 17)
    draft.edit({ note: 'receipt-reload-and-retry' })
    const reloaded = env.open()
    expect(reloaded.value).toMatchObject({ status: 'draft', note: 'receipt-reload-and-retry', items: [{ productId: 5, quantity: 17 }] })
    expect(reloaded.value.key).toBe(draft.value.key)
  })
  it('combines products and freezes the same payload/key across an uncertain reload', () => {
    const env = setup(), draft = env.open()
    draft.add(5); draft.add(5); draft.edit({ note: 'delivery' })
    const submission = draft.begin()
    expect(submission.input.items).toEqual([{ productId: 5, quantity: 2 }])
    const restored = env.open()
    expect(restored.value.status).toBe('unknown')
    expect(restored.begin()).toEqual(submission)
    expect(() => restored.add(7)).toThrow()
    expect(() => restored.newDraft()).toThrow()
  })
  it('keeps users isolated and persists confirmed receipt before permitting a new key', () => {
    const env = setup(), first = env.open()
    first.add(5); const original = first.begin()
    expect(env.open(2).value.items).toEqual([])
    first.confirm(42)
    expect(env.open().value.receiptId).toBe(42)
    first.newDraft()
    expect(first.value.key).not.toBe(original.key)
  })
  it('blocks corrupt storage instead of silently replacing a potentially submitted draft', () => {
    const env = setup(); env.open()
    env.data.set('pos.stock-receipt.1', '{bad')
    expect(() => env.open()).toThrow()
  })
  it('never sends when persistence fails', () => {
    const env = setup(), draft = env.open()
    draft.add(5)
    env.storage.setItem = () => { throw new Error('quota') }
    expect(() => draft.begin()).toThrow()
    expect(draft.value.status).toBe('draft')
  })
  it('retains a retryable frozen request if confirmation cannot be persisted', () => {
    const env = setup(), draft = env.open()
    draft.add(5); const submission = draft.begin()
    const write = env.storage.setItem
    env.storage.setItem = () => { throw new Error('quota') }
    expect(() => draft.confirm(42)).toThrow()
    expect(() => draft.newDraft()).toThrow()
    env.storage.setItem = write
    expect(env.open().begin()).toEqual(submission)
  })
  it('rejects storage reads and writes that are unavailable before creating a usable draft', () => {
    const env = setup()
    env.storage.setItem = () => { throw new Error('blocked') }
    expect(() => env.open()).toThrow()
    env.storage.getItem = () => { throw new Error('blocked') }
    expect(() => env.open()).toThrow()
  })
  it('rejects stale cross-tab edits before they can overwrite a submitted request', () => {
    const env = setup(), first = env.open(), second = env.open()
    first.add(5); first.begin()
    expect(() => second.add(7)).toThrow()
  })
  it('allows editing after a definitive rejection but preserves the key', () => {
    const env = setup(), draft = env.open()
    draft.add(5); const key = draft.begin().key
    draft.reject(); draft.quantity(5, 3)
    expect(draft.begin().key).toBe(key)
    draft.uncertain()
    expect(() => draft.newDraft()).toThrow()
  })
})
