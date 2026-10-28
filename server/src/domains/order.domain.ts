import { DomainConflictError } from './errors/domain-conflict.error'
import { DomainError } from './errors/domain-error'
import { DomainNotFoundError } from './errors/domain-not-found.error'
import { lineKey, type LineOption } from './modifier.domain'

export const ORDER_STATUSES = ['open', 'paid', 'cancelled', 'merged'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

/** One line of an order. Name, SKU and price are what was quoted when it was ordered. */
export interface OrderItem {
  /** Id of the stored line; 0 until the order has been stored. */
  lineId: number
  productId: number
  productName: string
  sku: string
  /** The product's price plus the options chosen: what is charged for one unit of this line. */
  unitPriceSatang: number
  quantity: number
  options: readonly LineOption[]
  /** An optional note on the line, such as "less sweet". Blank means none. */
  note: string | null
}

/** What is needed to put a product on an order: the product as it is now. */
export type OrderedProduct = Pick<OrderItem, 'productId' | 'productName' | 'sku' | 'unitPriceSatang'>

export interface NewOrder {
  memberId?: number | null
  branchId: number
  label: string | null
  /** The table the order is on; null for an order without one. */
  tableId: number | null
  openedById: number
  openedByName: string
  items: OrderItem[]
}

export interface OrderEntityProps extends NewOrder {
  /** 0 until the order has been stored. */
  id: number
  status: OrderStatus
  saleId: number | null
  cancelReason: string | null
  cancelledById: number | null
  /** The order this one was merged into; set when status is merged. */
  mergedIntoId: number | null
  createdAt: Date
  updatedAt: Date
}

/** Part of one line to take off an order: how many of the line's units. */
export interface SplitSelection {
  lineId: number
  quantity: number
}

export const MAX_ORDER_LINES = 100
export const MAX_LINE_QUANTITY = 9999
export const MAX_NOTE_LENGTH = 200
const MAX_LABEL_LENGTH = 100
const MAX_REASON_LENGTH = 500

const invalid = (message: string) => new DomainError(message, 'INVALID_ORDER')

function assertLabel(label: string | null) {
  if (label !== null && (label.length < 1 || label.length > MAX_LABEL_LENGTH))
    throw invalid(`ป้ายชื่อออเดอร์ต้องยาว 1 ถึง ${MAX_LABEL_LENGTH} ตัวอักษร`)
}

function assertQuantity(quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY)
    throw invalid(`จำนวนสินค้าต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง ${MAX_LINE_QUANTITY}`)
}

/** The identity of a line from its product and the stored key of its options. */
export const identityOf = (productId: number, optionsKey: string) => `${productId}:${optionsKey}`

/**
 * The same product with the same options is the same item: its lines share one price even when their
 * notes differ.
 */
export const lineIdentity = (productId: number, options: readonly LineOption[]) =>
  identityOf(productId, lineKey(options))

/** The same product with the same options and the same note is the same line. */
const identity = (item: OrderItem) => `${lineIdentity(item.productId, item.options)}\u0000${item.note ?? ''}`

/**
 * The lines of an order, with repeated products, options and notes merged into the first line of each.
 * A note belongs to its own line, so it never moves onto another line. Every line of one item keeps the
 * price of the item's first line, because the checkout merges the item's lines and charges that price.
 */
function mergeLines(items: readonly OrderItem[]): OrderItem[] {
  const priceOfItem = new Map<string, number>()
  for (const item of items) {
    assertQuantity(item.quantity)
    const itemKey = lineIdentity(item.productId, item.options)
    if (!priceOfItem.has(itemKey)) priceOfItem.set(itemKey, item.unitPriceSatang)
  }
  const merged = new Map<string, OrderItem>()
  for (const item of items) {
    const priced = { ...item, unitPriceSatang: priceOfItem.get(lineIdentity(item.productId, item.options))! }
    const key = identity(priced)
    const existing = merged.get(key)
    merged.set(key, existing ? { ...existing, quantity: existing.quantity + item.quantity } : priced)
  }
  const lines = [...merged.values()]
  lines.forEach((line) => assertQuantity(line.quantity))
  if (lines.length > MAX_ORDER_LINES) throw invalid(`ออเดอร์มีรายการได้ไม่เกิน ${MAX_ORDER_LINES} บรรทัด`)
  return lines
}

/** The first line of a product without options, which is the line the routes by productId edit. */
const plainLineOf = (items: readonly OrderItem[], productId: number) =>
  items.find((item) => item.productId === productId && item.options.length === 0)

const lineWithId = (lineId: number) => (item: OrderItem) => item.lineId === lineId

function cleanNote(note: string | null): string | null {
  const trimmed = note?.trim() || null
  if (trimmed !== null && trimmed.length > MAX_NOTE_LENGTH)
    throw invalid(`หมายเหตุต้องไม่เกิน ${MAX_NOTE_LENGTH} ตัวอักษร`)
  return trimmed
}

/**
 * A bill that is still being built. It is edited while open and closed once: paid (it then
 * refers to its sale) or cancelled. Every change returns a new entity.
 */
export class OrderEntity {
  public readonly memberId: number | null
  public readonly id: number
  public readonly branchId: number
  public readonly label: string | null
  public readonly tableId: number | null
  public readonly status: OrderStatus
  public readonly openedById: number
  public readonly openedByName: string
  public readonly saleId: number | null
  public readonly cancelReason: string | null
  public readonly cancelledById: number | null
  public readonly mergedIntoId: number | null
  public readonly createdAt: Date
  public readonly updatedAt: Date
  public readonly items: readonly OrderItem[]

  constructor(props: OrderEntityProps) {
    if (!ORDER_STATUSES.includes(props.status)) throw invalid('สถานะของออเดอร์ไม่ถูกต้อง')
    assertLabel(props.label)
    if (props.status === 'paid' && props.saleId === null) throw invalid('ออเดอร์ที่ชำระแล้วต้องมีบิลขาย')
    if (props.status === 'merged' && props.mergedIntoId === null)
      throw invalid('ออเดอร์ที่รวมแล้วต้องบอกว่ารวมเข้าออเดอร์ไหน')

    this.memberId = props.memberId ?? null
    this.id = props.id
    this.branchId = props.branchId
    this.label = props.label
    this.tableId = props.tableId
    this.status = props.status
    this.openedById = props.openedById
    this.openedByName = props.openedByName
    this.saleId = props.saleId
    this.cancelReason = props.cancelReason
    this.cancelledById = props.cancelledById
    this.mergedIntoId = props.mergedIntoId
    this.createdAt = props.createdAt
    this.updatedAt = props.updatedAt
    this.items = props.items
  }

  /** Validates and normalizes a new order: blank label means none, repeated products are merged. */
  static open(input: NewOrder): NewOrder {
    const label = input.label?.trim() || null
    assertLabel(label)
    return { ...input, label, items: mergeLines(input.items) }
  }

  get subtotalSatang(): number {
    return this.items.reduce((total, item) => total + item.unitPriceSatang * item.quantity, 0)
  }

  get itemCount(): number {
    return this.items.reduce((total, item) => total + item.quantity, 0)
  }

  /**
   * Puts a product on the order. The same product with the same options and the same note (a new line
   * has none) gains the quantity. `product.unitPriceSatang` is the unit price including the options;
   * every line of one item keeps the price of that item's first line.
   */
  addItem(product: OrderedProduct, quantity: number, options: readonly LineOption[] = []): OrderEntity {
    this.assertOpen()
    assertQuantity(quantity)
    return this.change({
      items: mergeLines([...this.items, { ...product, lineId: 0, options, quantity, note: null }]),
    })
  }

  /** Sets how many of a product, without options, are ordered: its first such line. */
  setQuantity(productId: number, quantity: number): OrderEntity {
    this.assertOpen()
    // Matched by the line itself, because the lines of an order that has not been stored yet share lineId 0.
    const line = this.requirePlainLine(productId)
    return this.setQuantityOf((item) => item === line, quantity)
  }

  /** Sets how many of one line are ordered, whatever options it has. */
  setLineQuantity(lineId: number, quantity: number): OrderEntity {
    return this.setQuantityOf(lineWithId(lineId), quantity)
  }

  /** Sets, or with null clears, the note of one line. The caller checks that the line has not been sent. */
  setLineNote(lineId: number, note: string | null): OrderEntity {
    this.assertOpen()
    const value = cleanNote(note)
    this.requireItem(lineWithId(lineId))
    return this.change({
      items: mergeLines(this.items.map((item) => (item.lineId === lineId ? { ...item, note: value } : item))),
    })
  }

  /**
   * How many units of each item the order holds, by line identity (see lineIdentity): the quantities
   * of every note of that item added up.
   */
  quantitiesByLine(): Map<string, number> {
    const quantities = new Map<string, number>()
    for (const item of this.items) {
      const key = lineIdentity(item.productId, item.options)
      quantities.set(key, (quantities.get(key) ?? 0) + item.quantity)
    }
    return quantities
  }

  /** Takes the first line of a product without options off the order. */
  removeItem(productId: number): OrderEntity {
    this.assertOpen()
    const line = this.requirePlainLine(productId)
    return this.removeWhere((item) => item === line)
  }

  removeLine(lineId: number): OrderEntity {
    return this.removeWhere(lineWithId(lineId))
  }

  /** Puts the order on another table, or on none. */
  moveToTable(tableId: number | null): OrderEntity {
    this.assertOpen()
    return this.change({ tableId })
  }

  /**
   * Takes the lines of another open order onto this one. A line of the same product, options and note
   * adds to this order's line; a different note stays a line of its own. Every line of one item keeps
   * the price quoted here. Call markMerged on the source afterwards.
   */
  absorb(source: OrderEntity): OrderEntity {
    this.assertOpen()
    source.assertOpen()
    if (source.id === this.id) throw new DomainError('รวมออเดอร์เข้ากับตัวเองไม่ได้', 'ORDER_MERGE_SAME')
    if (this.memberId !== null && source.memberId !== null && this.memberId !== source.memberId)
      throw new DomainConflictError('สมาชิกของออเดอร์ไม่ตรงกัน กรุณาจัดสมาชิกก่อนรวมบิล', 'ORDER_MEMBER_CONFLICT')
    return this.change({ memberId: this.memberId ?? source.memberId, items: mergeLines([...this.items, ...source.items.map((item) => ({ ...item, lineId: 0 }))]) })
  }

  /** Closes this order as merged into another: its lines have moved there. */
  markMerged(intoId: number): OrderEntity {
    this.assertOpen()
    return this.change({ status: 'merged', mergedIntoId: intoId, items: [] })
  }

  /**
   * Takes part of the lines off this order into a new order on the same table. At least one unit must
   * stay here. Prices and options go with the lines as quoted.
   */
  splitOff(
    selection: readonly SplitSelection[],
    actor: { id: number; displayName: string },
    label: string | null,
  ): { remaining: OrderEntity; created: NewOrder } {
    this.assertOpen()
    if (selection.length === 0) throw new DomainError('ต้องเลือกรายการที่จะแยกอย่างน้อยหนึ่งรายการ', 'ORDER_SPLIT_EMPTY')
    if (new Set(selection.map((pick) => pick.lineId)).size !== selection.length)
      throw invalid('เลือกบรรทัดเดียวกันซ้ำไม่ได้')
    for (const pick of selection) {
      assertQuantity(pick.quantity)
      if (!this.items.some((item) => item.lineId === pick.lineId))
        throw new DomainNotFoundError('ไม่พบสินค้านี้ในออเดอร์', 'ORDER_ITEM_NOT_FOUND')
    }

    const moved: OrderItem[] = []
    const kept = this.items.flatMap((item) => {
      const pick = selection.find((candidate) => candidate.lineId === item.lineId)
      if (!pick) return [item]
      if (pick.quantity > item.quantity)
        throw new DomainError('จำนวนที่แยกมากกว่าที่มีในบรรทัด', 'ORDER_SPLIT_QUANTITY', { available: item.quantity })
      moved.push({ ...item, lineId: 0, quantity: pick.quantity })
      return pick.quantity === item.quantity ? [] : [{ ...item, quantity: item.quantity - pick.quantity }]
    })
    if (kept.length === 0)
      throw new DomainError('ต้องเหลืออย่างน้อยหนึ่งรายการในออเดอร์เดิม', 'ORDER_SPLIT_EMPTY')

    return {
      remaining: this.change({ items: kept }),
      created: OrderEntity.open({
        memberId: this.memberId,
        branchId: this.branchId,
        label: label ?? this.label,
        tableId: this.tableId,
        openedById: actor.id,
        openedByName: actor.displayName,
        items: moved,
      }),
    }
  }

  setMember(memberId: number | null): OrderEntity {
    this.assertOpen()
    if (memberId !== null && (!Number.isSafeInteger(memberId) || memberId < 1)) throw invalid('รหัสสมาชิกไม่ถูกต้อง')
    return this.change({ memberId })
  }

  /** A blank label clears it. */
  rename(label: string | null): OrderEntity {
    this.assertOpen()
    const next = label?.trim() || null
    assertLabel(next)
    return this.change({ label: next })
  }

  cancel(reason: string, cancelledById: number): OrderEntity {
    this.assertOpen()
    if (reason.length < 1 || reason.length > MAX_REASON_LENGTH)
      throw invalid(`เหตุผลที่ยกเลิกต้องยาว 1 ถึง ${MAX_REASON_LENGTH} ตัวอักษร`)
    return this.change({ status: 'cancelled', cancelReason: reason, cancelledById })
  }

  /** Closes the order as paid by the given sale. An empty order cannot be paid. */
  markPaid(saleId: number): OrderEntity {
    this.assertPayable()
    return this.change({ status: 'paid', saleId })
  }

  /** Throws unless the order is open and has something on it, which is what paying needs. */
  assertPayable(): void {
    this.assertOpen()
    if (this.items.length === 0) throw new DomainError('ออเดอร์ยังไม่มีรายการ', 'ORDER_EMPTY')
  }

  toSnapshot(): OrderEntityProps & { memberId: number | null } {
    return {
      memberId: this.memberId,
      id: this.id,
      branchId: this.branchId,
      label: this.label,
      tableId: this.tableId,
      status: this.status,
      openedById: this.openedById,
      openedByName: this.openedByName,
      saleId: this.saleId,
      cancelReason: this.cancelReason,
      cancelledById: this.cancelledById,
      mergedIntoId: this.mergedIntoId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      items: this.items.map((item) => ({ ...item })),
    }
  }

  /** Throws ORDER_NOT_OPEN unless the order can still be changed. */
  assertOpen(): void {
    if (this.status !== 'open') throw new DomainConflictError('ออเดอร์นี้ปิดแล้ว แก้ไขไม่ได้', 'ORDER_NOT_OPEN')
  }

  private setQuantityOf(match: (item: OrderItem) => boolean, quantity: number): OrderEntity {
    this.assertOpen()
    assertQuantity(quantity)
    this.requireItem(match)
    return this.change({ items: this.items.map((item) => (match(item) ? { ...item, quantity } : item)) })
  }

  private removeWhere(match: (item: OrderItem) => boolean): OrderEntity {
    this.assertOpen()
    this.requireItem(match)
    return this.change({ items: this.items.filter((item) => !match(item)) })
  }

  /** The first line of a product without options: the one the routes by productId edit. */
  private requirePlainLine(productId: number): OrderItem {
    const line = plainLineOf(this.items, productId)
    if (!line) throw new DomainNotFoundError('ไม่พบสินค้านี้ในออเดอร์', 'ORDER_ITEM_NOT_FOUND')
    return line
  }

  private requireItem(match: (item: OrderItem) => boolean): void {
    if (!this.items.some(match)) throw new DomainNotFoundError('ไม่พบสินค้านี้ในออเดอร์', 'ORDER_ITEM_NOT_FOUND')
  }

  private change(changes: Partial<OrderEntityProps>): OrderEntity {
    return new OrderEntity({ ...this.toSnapshot(), ...changes })
  }
}
