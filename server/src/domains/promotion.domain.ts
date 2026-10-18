import { DomainError } from './errors/domain-error'
import { MAX_AMOUNT_SATANG, type SalePromotion } from './sale.domain'

export const PROMOTION_KINDS = ['fixed', 'percent'] as const
export type PromotionKind = (typeof PROMOTION_KINDS)[number]

export const PROMOTION_AUDIENCES = ['everyone', 'members'] as const
export type PromotionAudience = (typeof PROMOTION_AUDIENCES)[number]

/** The products and categories a promotion is limited to; a line matches by either. */
export interface PromotionScope {
  productIds: readonly number[]
  categoryIds: readonly number[]
}

/** The part of a promotion the rules read; the entity and the web's plain objects both satisfy it. */
export interface PromotionRules {
  id: number
  kind: PromotionKind
  /** Satang for `fixed`, basis points for `percent` (700 = 7%). */
  value: number
  /** Ceiling of a `percent` promotion; null means none. */
  maxDiscountSatang: number | null
  /** Compared with the subtotal before discount and before VAT that is added on top. */
  minSubtotalSatang: number
  /** Dates in the shop's time zone as `YYYY-MM-DD`, both included; null means unbounded. */
  startsOn: string | null
  endsOn: string | null
  /** 0 = Sunday ... 6 = Saturday; null means every day. */
  weekdays: readonly number[] | null
  /** Minutes of the day. The end is outside the window; an end before the start crosses midnight. */
  windowStartMinute: number | null
  windowEndMinute: number | null
  audience: PromotionAudience
  isActive: boolean
  /** Null means the whole bill. */
  scope: PromotionScope | null
}

/** One cart line as a scoped promotion sees it: what it is and what it costs before any discount. */
export interface PromotionLine {
  productId: number
  categoryId: number | null
  lineTotalSatang: number
}

export interface PromotionContext {
  subtotalSatang: number
  hasMember: boolean
  at: Date
  timeZone: string
  lines: readonly PromotionLine[]
}

export type PromotionEvaluation = { eligible: false } | { eligible: true; discountSatang: number }

const NOT_ELIGIBLE: PromotionEvaluation = { eligible: false }
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const BASIS_POINTS = 10_000

interface Day {
  /** `YYYY-MM-DD`. */
  date: string
  weekday: number
}

/** The date, weekday and minute of the day that `at` is in the given time zone. */
function localMoment(at: Date, timeZone: string): Day & { minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)!.value
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    weekday: WEEKDAY_NAMES.indexOf(part('weekday')),
    minute: Number(part('hour')) * 60 + Number(part('minute')),
  }
}

function previousDay(date: string): Day {
  const day = new Date(`${date}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() - 1)
  return { date: day.toISOString().slice(0, 10), weekday: day.getUTCDay() }
}

/** What a promotion's discount is taken from: the whole bill, or only the lines in its scope. */
function discountBase(scope: PromotionScope | null, context: PromotionContext): number {
  if (scope === null) return context.subtotalSatang
  return context.lines
    .filter((line) => scope.productIds.includes(line.productId) || (line.categoryId !== null && scope.categoryIds.includes(line.categoryId)))
    .reduce((total, line) => total + line.lineTotalSatang, 0)
}

/**
 * The one rule for whether a promotion applies and what it gives, shared by the server and the till so
 * the cart shows what the server will choose. All amounts are integer satang.
 */
export function evaluatePromotion(rules: PromotionRules, context: PromotionContext): PromotionEvaluation {
  if (!rules.isActive) return NOT_ELIGIBLE
  if (rules.audience === 'members' && !context.hasMember) return NOT_ELIGIBLE
  if (context.subtotalSatang < 1 || context.subtotalSatang < rules.minSubtotalSatang) return NOT_ELIGIBLE

  const now = localMoment(context.at, context.timeZone)
  // The day a window belongs to is the day it started on, so "Friday 22:00-02:00" includes Saturday 01:00.
  let day: Day = { date: now.date, weekday: now.weekday }
  if (rules.windowStartMinute !== null && rules.windowEndMinute !== null) {
    const start = rules.windowStartMinute
    const end = rules.windowEndMinute
    if (start < end) {
      if (now.minute < start || now.minute >= end) return NOT_ELIGIBLE
    } else if (now.minute < start) {
      if (now.minute >= end) return NOT_ELIGIBLE
      day = previousDay(now.date)
    }
  }
  if (rules.weekdays && rules.weekdays.length > 0 && !rules.weekdays.includes(day.weekday)) return NOT_ELIGIBLE
  if (rules.startsOn !== null && day.date < rules.startsOn) return NOT_ELIGIBLE
  if (rules.endsOn !== null && day.date > rules.endsOn) return NOT_ELIGIBLE

  const base = discountBase(rules.scope, context)
  if (base < 1) return NOT_ELIGIBLE
  const given = rules.kind === 'fixed' ? rules.value : Math.round((base * rules.value) / BASIS_POINTS)
  const capped =
    rules.kind === 'percent' && rules.maxDiscountSatang !== null ? Math.min(given, rules.maxDiscountSatang) : given
  const discountSatang = Math.min(capped, base, context.subtotalSatang)
  return discountSatang >= 1 ? { eligible: true, discountSatang } : NOT_ELIGIBLE
}

/** The promotion that gives the most; a tie goes to the lowest id so the answer is always the same. */
export function pickBestPromotion<T extends PromotionRules>(
  promotions: readonly T[],
  context: PromotionContext,
): { promotion: T; discountSatang: number } | null {
  let best: { promotion: T; discountSatang: number } | null = null
  for (const promotion of promotions) {
    const result = evaluatePromotion(promotion, context)
    if (!result.eligible) continue
    const beats =
      best === null ||
      result.discountSatang > best.discountSatang ||
      (result.discountSatang === best.discountSatang && promotion.id < best.promotion.id)
    if (beats) best = { promotion, discountSatang: result.discountSatang }
  }
  return best
}

export interface PromotionProps extends PromotionRules {
  name: string
  /** Storage key of the display image (`promotions/<id>/<uuid>.<ext>`); null means no image. Never priced, never patched. */
  imageKey: string | null
  createdAt: Date
  updatedAt: Date
}

export type PromotionChanges = Partial<Omit<PromotionProps, 'id' | 'createdAt' | 'updatedAt'>>

const invalid = (message: string) => new DomainError(message, 'INVALID_PROMOTION')
const isWholeNumber = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value)
const MAX_NAME_LENGTH = 80
const MINUTES_PER_DAY = 1440
/** Bounds what one promotion can list, so a form or a script cannot store an unbounded array. */
export const MAX_SCOPE_IDS = 500

/** Sorted, without repeats; both lists empty means the whole bill (null). */
function normalizeScope(scope: PromotionScope | null): PromotionScope | null {
  if (scope === null) return null
  const ids = (values: readonly number[], label: string) => {
    if (values.length > MAX_SCOPE_IDS) throw invalid(`เลือก${label}ได้ไม่เกิน ${MAX_SCOPE_IDS} รายการ`)
    if (!values.every((id) => isWholeNumber(id) && id >= 1)) throw invalid(`รหัส${label}ไม่ถูกต้อง`)
    return [...new Set(values)].sort((a, b) => a - b)
  }
  const productIds = ids(scope.productIds, 'สินค้า')
  const categoryIds = ids(scope.categoryIds, 'หมวดหมู่')
  return productIds.length === 0 && categoryIds.length === 0 ? null : { productIds, categoryIds }
}

function assertDate(value: string | null, label: string) {
  if (value === null) return
  const parsed = new Date(`${value}T00:00:00Z`)
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  if (!valid) throw invalid(`${label}ไม่ถูกต้อง`)
}

/** A promotion the shop has set up. Every change returns a new entity. */
export class PromotionEntity implements PromotionRules {
  public readonly id: number
  public readonly name: string
  public readonly kind: PromotionKind
  public readonly value: number
  public readonly maxDiscountSatang: number | null
  public readonly minSubtotalSatang: number
  public readonly startsOn: string | null
  public readonly endsOn: string | null
  public readonly weekdays: readonly number[] | null
  public readonly windowStartMinute: number | null
  public readonly windowEndMinute: number | null
  public readonly audience: PromotionAudience
  public readonly isActive: boolean
  public readonly scope: PromotionScope | null
  public readonly imageKey: string | null
  public readonly createdAt: Date
  public readonly updatedAt: Date

  constructor(props: PromotionProps) {
    const name = props.name.trim()
    if (name.length < 1 || name.length > MAX_NAME_LENGTH)
      throw invalid(`ชื่อโปรโมชันต้องยาว 1 ถึง ${MAX_NAME_LENGTH} ตัวอักษร`)
    if (!PROMOTION_KINDS.includes(props.kind)) throw invalid('ชนิดของโปรโมชันไม่ถูกต้อง')
    if (props.kind === 'fixed' && !(isWholeNumber(props.value) && props.value >= 1 && props.value <= MAX_AMOUNT_SATANG))
      throw invalid('ส่วนลดเป็นบาทต้องเป็นจำนวนเต็มสตางค์ตั้งแต่ 1 ขึ้นไป และไม่เกินที่ระบบรองรับ')
    if (props.kind === 'percent' && !(isWholeNumber(props.value) && props.value >= 1 && props.value <= BASIS_POINTS))
      throw invalid('ส่วนลดเป็นเปอร์เซ็นต์ต้องอยู่ระหว่าง 0.01% ถึง 100%')
    if (props.maxDiscountSatang !== null) {
      if (props.kind !== 'percent') throw invalid('เพดานส่วนลดใช้ได้กับแบบเปอร์เซ็นต์เท่านั้น')
      if (!isWholeNumber(props.maxDiscountSatang) || props.maxDiscountSatang < 1 || props.maxDiscountSatang > MAX_AMOUNT_SATANG)
        throw invalid('เพดานส่วนลดต้องเป็นจำนวนเต็มสตางค์ตั้งแต่ 1 ขึ้นไป')
    }
    if (!isWholeNumber(props.minSubtotalSatang) || props.minSubtotalSatang < 0 || props.minSubtotalSatang > MAX_AMOUNT_SATANG)
      throw invalid('ยอดขั้นต่ำต้องเป็นจำนวนเต็มสตางค์ที่ไม่ติดลบ')

    assertDate(props.startsOn, 'วันเริ่ม')
    assertDate(props.endsOn, 'วันสิ้นสุด')
    if (props.startsOn !== null && props.endsOn !== null && props.startsOn > props.endsOn)
      throw invalid('วันเริ่มต้องไม่เกินวันสิ้นสุด')

    let weekdays: number[] | null = null
    if (props.weekdays !== null && props.weekdays.length > 0) {
      if (!props.weekdays.every((day) => isWholeNumber(day) && day >= 0 && day <= 6))
        throw invalid('วันในสัปดาห์ต้องเป็นเลข 0 ถึง 6')
      weekdays = [...new Set(props.weekdays)].sort((a, b) => a - b)
    }

    const { windowStartMinute: start, windowEndMinute: end } = props
    if ((start === null) !== (end === null)) throw invalid('ต้องกำหนดเวลาเริ่มและเวลาสิ้นสุดของช่วงเวลาพร้อมกัน')
    if (start !== null && end !== null) {
      const inDay = (minute: number) => isWholeNumber(minute) && minute >= 0 && minute < MINUTES_PER_DAY
      if (!inDay(start) || !inDay(end)) throw invalid('เวลาของช่วงเวลาไม่ถูกต้อง')
      if (start === end) throw invalid('เวลาเริ่มและเวลาสิ้นสุดต้องไม่เท่ากัน')
    }
    if (!PROMOTION_AUDIENCES.includes(props.audience)) throw invalid('กลุ่มลูกค้าไม่ถูกต้อง')
    const scope = normalizeScope(props.scope)

    this.id = props.id
    this.name = name
    this.kind = props.kind
    this.value = props.value
    this.maxDiscountSatang = props.maxDiscountSatang
    this.minSubtotalSatang = props.minSubtotalSatang
    this.startsOn = props.startsOn
    this.endsOn = props.endsOn
    this.weekdays = weekdays
    this.windowStartMinute = start
    this.windowEndMinute = end
    this.audience = props.audience
    this.isActive = props.isActive
    this.scope = scope
    this.imageKey = props.imageKey
    this.createdAt = props.createdAt
    this.updatedAt = props.updatedAt
  }

  /** Only the fields given change; `null` is a value (it clears a bound), `undefined` means leave it. The image key never changes here: only the image endpoints set it. */
  with(changes: PromotionChanges, now: Date): PromotionEntity {
    const given = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined))
    return new PromotionEntity({ ...this.toSnapshot(), ...given, imageKey: this.imageKey, updatedAt: now })
  }

  /** What a sale keeps of this promotion when it gave `discountSatang`. */
  toSalePromotion(discountSatang: number): SalePromotion {
    return {
      id: this.id,
      name: this.name,
      kind: this.kind,
      value: this.value,
      maxDiscountSatang: this.maxDiscountSatang,
      discountSatang,
    }
  }

  toSnapshot(): PromotionProps {
    return {
      id: this.id,
      name: this.name,
      kind: this.kind,
      value: this.value,
      maxDiscountSatang: this.maxDiscountSatang,
      minSubtotalSatang: this.minSubtotalSatang,
      startsOn: this.startsOn,
      endsOn: this.endsOn,
      weekdays: this.weekdays ? [...this.weekdays] : null,
      windowStartMinute: this.windowStartMinute,
      windowEndMinute: this.windowEndMinute,
      audience: this.audience,
      isActive: this.isActive,
      scope: this.scope ? { productIds: [...this.scope.productIds], categoryIds: [...this.scope.categoryIds] } : null,
      imageKey: this.imageKey,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    }
  }
}
