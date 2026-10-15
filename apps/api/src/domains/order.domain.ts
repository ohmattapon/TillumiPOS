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
  /** A note for the kitchen, such as "no ice". Blank means none. */
  note: string | null
}

/** What is needed to put a product on an order: the product as it is now. */
export type OrderedProduct = Pick<OrderItem, 'productId' | 'productName' | 'sku' | 'unitPriceSatang'>

export interface NewOrder {
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

/** The same product with the same options is the same line. The kitchen uses this same identity. */
export const lineIdentity = (productId: number, options: readonly LineOption[]) =>
  identityOf(productId, lineKey(options))

function cleanNote(note: string | null): string | null {
  const trimmed = note?.trim() || null
  if (trimmed !== null && trimmed.length > MAX_NOTE_LENGTH)
    throw invalid(`หมายเหตุต้องไม่เกิน ${MAX_NOTE_LENGTH} ตัวอักษร`)
  return trimmed
}

const identity = (item: OrderItem) => lineIdentity(item.productId, item.options)

/** The lines of an order, with repeated products and options merged into the first line of each. */
function mergeLines(items: readonly OrderItem[]): OrderItem[] {
  const merged = new Map<string, OrderItem>()
  for (const item of items) {
    assertQuantity(item.quantity)
    const key = identity(item)
    const existing = merged.get(key)
    merged.set(
      key,
      existing
        ? { ...existing, quantity: existing.quantity + item.quantity, note: existing.note ?? item.note }
        : { ...item },
    )
  }
  const lines = [...merged.values()]
  lines.forEach((line) => assertQuantity(line.quantity))
  if (lines.length > MAX_ORDER_LINES) throw invalid(`ออเดอร์มีรายการได้ไม่เกิน ${MAX_ORDER_LINES} บรรทัด`)
  return lines
}

const plainLineOf = (productId: number) => (item: OrderItem) => item.productId === productId && item.options.length === 0
const lineWithId = (lineId: number) => (item: OrderItem) => item.lineId === lineId

/**
 * A bill that is still being built. It is edited while open and closed once: paid (it then
 * refers to its sale) or cancelled. Every change returns a new entity.
 */
export class OrderEntity {
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
   * Puts a product on the order. The same product with the same options gains the quantity and keeps
   * the price it was quoted. `product.unitPriceSatang` is the unit price including the options.
   */
  addItem(product: OrderedProduct, quantity: number, options: readonly LineOption[] = []): OrderEntity {
    this.assertOpen()
    assertQuantity(quantity)
    return this.change({
      items: mergeLines([...this.items, { ...product, lineId: 0, options, quantity, note: null }]),
    })
  }

  /** Sets how many of a product, without options, are ordered. */
  setQuantity(productId: number, quantity: number): OrderEntity {
    return this.setQuantityOf(plainLineOf(productId), quantity)
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
    return this.change({ items: this.items.map((item) => (item.lineId === lineId ? { ...item, note: value } : item)) })
  }

  /** How many units of each line the order holds, by line identity (see lineIdentity). */
  quantitiesByLine(): Map<string, number> {
    return new Map(this.items.map((item) => [identity(item), item.quantity]))
  }

  /** Takes the line of a product without options off the order. */
  removeItem(productId: number): OrderEntity {
    return this.removeWhere(plainLineOf(productId))
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
   * Takes the lines of another open order onto this one. A line of the same product and options adds
   * to this order's line and keeps the price quoted here. Call markMerged on the source afterwards.
   */
  absorb(source: OrderEntity): OrderEntity {
    this.assertOpen()
    source.assertOpen()
    if (source.id === this.id) throw new DomainError('รวมออเดอร์เข้ากับตัวเองไม่ได้', 'ORDER_MERGE_SAME')
    return this.change({ items: mergeLines([...this.items, ...source.items.map((item) => ({ ...item, lineId: 0 }))]) })
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
        branchId: this.branchId,
        label: label ?? this.label,
        tableId: this.tableId,
        openedById: actor.id,
        openedByName: actor.displayName,
        items: moved,
      }),
    }
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

  toSnapshot(): OrderEntityProps {
    return {
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

  private requireItem(match: (item: OrderItem) => boolean): void {
    if (!this.items.some(match)) throw new DomainNotFoundError('ไม่พบสินค้านี้ในออเดอร์', 'ORDER_ITEM_NOT_FOUND')
  }

  private change(changes: Partial<OrderEntityProps>): OrderEntity {
    return new OrderEntity({ ...this.toSnapshot(), ...changes })
  }
}
