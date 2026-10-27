import { z } from 'zod'

const itemSchema = z.object({ productId: z.number().int().positive(), quantity: z.number().int().positive().max(2147483647), packId: z.number().int().positive().optional() })
const inputSchema = z.object({ items: z.array(itemSchema).min(1).max(100), note: z.string().max(500).optional() })
const schema = z.object({
  key: z.uuid(), items: z.array(itemSchema).max(100), note: z.string().max(500),
  status: z.enum(['draft', 'submitting', 'unknown', 'confirmed']),
  frozen: inputSchema.optional(), receiptId: z.number().int().positive().optional(),
}).superRefine((draft, context) => {
  if ((draft.status === 'submitting' || draft.status === 'unknown') && !draft.frozen)
    context.addIssue({ code: 'custom', message: 'Missing frozen submission' })
  if (draft.status === 'confirmed' && !draft.receiptId)
    context.addIssue({ code: 'custom', message: 'Missing receipt' })
})

export type ReceiptInput = z.infer<typeof inputSchema>
export type ReceiptDraft = z.infer<typeof schema>
export interface DraftStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

/** Durable write-before-send journal. Only ids and user input enter storage. */
export class ReceiptDraftStore {
  private raw: string | null
  private state: ReceiptDraft
  private readonly storageKey: string

  constructor(actorId: number, private storage: DraftStorage, private uuid: () => string) {
    this.storageKey = `pos.stock-receipt.${actorId}`
    this.raw = storage.getItem(this.storageKey)
    this.state = this.raw === null ? this.fresh() : schema.parse(JSON.parse(this.raw))
    if (this.state.status === 'submitting') this.state = { ...this.state, status: 'unknown' }
    if (this.raw === null || this.state.status === 'unknown') this.save(this.state)
  }

  get value(): ReceiptDraft { return structuredClone(this.state) }
  private fresh(): ReceiptDraft { return { key: this.uuid(), items: [], note: '', status: 'draft' } }
  private save(next: ReceiptDraft) {
    if (this.storage.getItem(this.storageKey) !== this.raw) throw new Error('DRAFT_CHANGED')
    const raw = JSON.stringify(schema.parse(next))
    this.storage.setItem(this.storageKey, raw)
    this.raw = raw; this.state = structuredClone(next)
  }
  private editable() { if (this.state.status !== 'draft') throw new Error('DRAFT_LOCKED') }
  edit(change: Partial<Pick<ReceiptDraft, 'items' | 'note'>>) { this.editable(); this.save({ ...this.state, ...change }) }
  add(productId: number) {
    this.editable()
    const found = this.state.items.find((item) => item.productId === productId)
    if (found) this.quantity(productId, found.quantity + 1)
    else this.edit({ items: [...this.state.items, { productId, quantity: 1 }] })
  }
  quantity(productId: number, quantity: number) {
    this.edit({ items: this.state.items.map((item) => item.productId === productId ? { ...item, quantity } : item) })
  }
  /** The unit a line arrived in. Pieces carry no `packId` at all, so a stored line stays exactly as before. */
  unit(productId: number, packId: number | undefined) {
    this.edit({
      items: this.state.items.map((item) => {
        if (item.productId !== productId) return item
        const { packId: _replaced, ...pieces } = item
        return packId === undefined ? pieces : { ...pieces, packId }
      }),
    })
  }
  remove(productId: number) { this.edit({ items: this.state.items.filter((item) => item.productId !== productId) }) }
  begin() {
    if (this.state.status === 'confirmed') throw new Error('DRAFT_LOCKED')
    const input = this.state.frozen ?? inputSchema.parse({ items: [...this.state.items].sort((a, b) => a.productId - b.productId), ...(this.state.note.trim() && { note: this.state.note.trim() }) })
    this.save({ ...this.state, frozen: input, status: 'submitting' })
    return { key: this.state.key, input: structuredClone(input) }
  }
  uncertain() { this.save({ ...this.state, status: 'unknown' }) }
  reject() { this.save({ ...this.state, status: 'draft', frozen: undefined }) }
  confirm(receiptId: number) { this.save({ ...this.state, status: 'confirmed', receiptId }) }
  newDraft() {
    if (this.state.status !== 'draft' && this.state.status !== 'confirmed') throw new Error('DRAFT_LOCKED')
    this.save(this.fresh())
  }
}
