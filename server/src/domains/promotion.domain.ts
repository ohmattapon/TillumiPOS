import { DomainError } from './errors/domain-error'
import { MAX_AMOUNT_SATANG, type SalePromotion } from './sale.domain'

export const PROMOTION_KINDS = ['fixed', 'percent', 'bundle'] as const
export type PromotionKind = (typeof PROMOTION_KINDS)[number]

export const PROMOTION_AUDIENCES = ['everyone', 'members'] as const
export type PromotionAudience = (typeof PROMOTION_AUDIENCES)[number]

/** The products and categories a promotion is limited to; a line matches by either. */
export interface PromotionScope {
  productIds: readonly number[]
  categoryIds: readonly number[]
}

/** A coupon promotion is sold only when the cashier types a code that matches this. */
export const COUPON_CODE_PATTERN = /^[A-Z0-9-]{3,20}$/

/** The part of a promotion the rules read; the entity and the web's plain objects both satisfy it. */
export interface PromotionRules {
  id: number
  kind: PromotionKind
  /** Satang for `fixed`, basis points for `percent` (700 = 7%); a `bundle` always carries 0. */
  value: number
  /** Ceiling of a `percent` or `bundle` promotion; null means none. */
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
  /** Null means the whole bill. A `bundle` requires a scope. */
  scope: PromotionScope | null
  /** Upper-case coupon code; a promotion with one applies only when the cashier types it. */
  couponCode: string | null
  /** Of a `bundle`: the items the customer buys. Both are null for every other kind. */
  buyQuantity: number | null
  freeQuantity: number | null
  /** Times this promotion may be used in total; null means unlimited. Carried here, enforced in the quotes module. */
  maxUses: number | null
  /** Times one member may use this promotion; null means unlimited, and only a members-only promotion may set it. */
  maxUsesPerMember: number | null
}

/** A cart line as a bundle sees it: a pack line counts as one line, never as its own pack size. */
export interface PromotionLine {
  productId: number
  categoryId: number | null
  /** The price of one item, before any discount; a pack line's own price, not size times the product price. */
  unitPriceSatang: number
  quantity: number
  isPack: boolean
  lineTotalSatang: number
}

export interface PromotionContext {
  subtotalSatang: number
  hasMember: boolean
  at: Date
  timeZone: string
  lines: readonly PromotionLine[]
  /** The code the cashier typed, normalized or not; null means none was typed. */
  couponCode: string | null
}

export type PromotionEvaluation = { eligible: false } | { eligible: true; discountSatang: number }

/** Why a coupon did not apply, told back to the till; null means it did. */
export type CouponIneligibility = 'not_running' | 'min_subtotal' | 'members_only' | 'not_eligible'

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

/** Whether the promotion's dates, weekdays and time window include `at`, in the shop's time zone. */
function isRunningAt(rules: PromotionRules, at: Date, timeZone: string): boolean {
  const now = localMoment(at, timeZone)
  // The day a window belongs to is the day it started on, so "Friday 22:00-02:00" includes Saturday 01:00.
  let day: Day = { date: now.date, weekday: now.weekday }
  if (rules.windowStartMinute !== null && rules.windowEndMinute !== null) {
    const start = rules.windowStartMinute
    const end = rules.windowEndMinute
    if (start < end) {
      if (now.minute < start || now.minute >= end) return false
    } else if (now.minute < start) {
      if (now.minute >= end) return false
      day = previousDay(now.date)
    }
  }
  if (rules.weekdays && rules.weekdays.length > 0 && !rules.weekdays.includes(day.weekday)) return false
  if (rules.startsOn !== null && day.date < rules.startsOn) return false
  if (rules.endsOn !== null && day.date > rules.endsOn) return false
  return true
}

const inScope = (scope: PromotionScope, item: { productId: number; categoryId: number | null }) =>
  scope.productIds.includes(item.productId) || (item.categoryId !== null && scope.categoryIds.includes(item.categoryId))

/** What a promotion's discount is taken from: the whole bill, or only the lines in its scope. */
function discountBase(scope: PromotionScope | null, context: PromotionContext): number {
  if (scope === null) return context.subtotalSatang
  return context.lines
    .filter((line) => inScope(scope, line))
    .reduce((total, line) => total + line.lineTotalSatang, 0)
}

/** The code a customer typed, trimmed and upper-cased so `summer10 ` still matches the stored `SUMMER10`. */
export const normalizeCouponCode = (code: string): string => code.trim().toUpperCase()

/** The parts of a bundle that the entity guarantees; plain rules the web sends may lack them. */
const validBundleQuantities = (value: number | null): value is number =>
  isWholeNumber(value) && value >= 1 && value <= MAX_BUNDLE_QUANTITY

/**
 * The discount a buy-X-get-Y bundle gives. Groups of `buy + free` units are taken from the in-scope,
 * non-pack lines sorted by unit price, highest first, so the cheapest unit of each full group is free.
 * The units are never materialized: each line contributes the free slots its run covers, O(lines).
 */
function bundleDiscount(rules: PromotionRules, scope: PromotionScope | null, context: PromotionContext): number {
  const buy = rules.buyQuantity
  const free = rules.freeQuantity
  if (!validBundleQuantities(buy) || !validBundleQuantities(free)) return 0
  const perGroup = buy + free
  const lines = context.lines
    .filter((line) => !line.isPack && (scope === null || inScope(scope, line)))
    .sort((a, b) => b.unitPriceSatang - a.unitPriceSatang)
  const units = lines.reduce((total, line) => total + line.quantity, 0)
  const groups = Math.floor(units / perGroup)
  if (groups < 1) return 0
  // Free slots are positions `buy` and later of each complete group; the trailing partial group frees nothing.
  const completeUpTo = groups * perGroup
  const freeSlotsBefore = (unitsBefore: number): number => {
    const counted = Math.min(unitsBefore, completeUpTo)
    const fullGroups = Math.floor(counted / perGroup)
    const partial = counted - fullGroups * perGroup
    return fullGroups * free + Math.min(Math.max(partial - buy, 0), free)
  }
  let given = 0
  let position = 0
  for (const line of lines) {
    given += (freeSlotsBefore(position + line.quantity) - freeSlotsBefore(position)) * line.unitPriceSatang
    position += line.quantity
  }
  return given
}

/**
 * The one rule for whether a promotion applies and what it gives, shared by the server and the till so
 * the cart shows what the server will choose. All amounts are integer satang.
 */
export function evaluatePromotion(rules: PromotionRules, context: PromotionContext): PromotionEvaluation {
  if (!rules.isActive) return NOT_ELIGIBLE
  // The coupon question comes before every other rule, so a missing code is never answered with a member
  // or minimum reason by mistake.
  if (rules.couponCode !== null) {
    const typed = context.couponCode === null ? null : normalizeCouponCode(context.couponCode)
    if (typed === null || typed !== normalizeCouponCode(rules.couponCode)) return NOT_ELIGIBLE
  }
  if (rules.audience === 'members' && !context.hasMember) return NOT_ELIGIBLE
  if (context.subtotalSatang < 1 || context.subtotalSatang < rules.minSubtotalSatang) return NOT_ELIGIBLE
  if (!isRunningAt(rules, context.at, context.timeZone)) return NOT_ELIGIBLE

  const base = discountBase(rules.scope, context)
  if (base < 1) return NOT_ELIGIBLE
  const given = rules.kind === 'fixed' ? rules.value : rules.kind === 'bundle' ? bundleDiscount(rules, rules.scope, context) : Math.round((base * rules.value) / BASIS_POINTS)
  const capped =
    rules.kind !== 'fixed' && rules.maxDiscountSatang !== null ? Math.min(given, rules.maxDiscountSatang) : given
  const discountSatang = Math.min(capped, base, context.subtotalSatang)
  return discountSatang >= 1 ? { eligible: true, discountSatang } : NOT_ELIGIBLE
}

/** Why a coupon promotion did not apply, ranked in the order `evaluatePromotion` asks its rules. */
export function couponIneligibility(rules: PromotionRules, context: PromotionContext): CouponIneligibility | null {
  if (!rules.isActive) return 'not_running'
  if (rules.audience === 'members' && !context.hasMember) return 'members_only'
  if (context.subtotalSatang < 1 || context.subtotalSatang < rules.minSubtotalSatang) return 'min_subtotal'
  if (!isRunningAt(rules, context.at, context.timeZone)) return 'not_running'
  return evaluatePromotion(rules, context).eligible ? null : 'not_eligible'
}

/** What the callers hand in: the rules plus the display name; the entity and the web's API item both have it. */
export type PromotionCandidate = PromotionRules & { name: string }

/**
 * The running promotions limited to this product or its category, in id order, so the till can tell the
 * cashier about a deal on what was just added. The cart's size and member are not checked: a promotion the
 * cart does not qualify for yet is still worth mentioning. Whole-bill promotions are left out.
 */
export function promotionsFor<T extends PromotionCandidate>(
  promotions: readonly T[],
  item: { productId: number; categoryId: number | null },
  at: Date,
  timeZone: string,
): T[] {
  return promotions
    .filter((promotion) => promotion.isActive && promotion.scope !== null && inScope(promotion.scope, item) && isRunningAt(promotion, at, timeZone))
    .sort((a, b) => a.id - b.id)
}

/** The promotion that gives the most; a tie goes to the lowest id so the answer is always the same. */
export function pickBestPromotion<T extends PromotionCandidate>(
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
/** The most items a bundle may ask for in one quantity field. */
export const MAX_BUNDLE_QUANTITY = 99
const USE_LIMIT_MAX = 2_147_483_647

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
  public readonly couponCode: string | null
  public readonly buyQuantity: number | null
  public readonly freeQuantity: number | null
  public readonly maxUses: number | null
  public readonly maxUsesPerMember: number | null
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
      if (props.kind === 'fixed') throw invalid('เพดานส่วนลดใช้ได้กับแบบเปอร์เซ็นต์และแบบซื้อแถมเท่านั้น')
      if (!isWholeNumber(props.maxDiscountSatang) || props.maxDiscountSatang < 1 || props.maxDiscountSatang > MAX_AMOUNT_SATANG)
        throw invalid('เพดานส่วนลดต้องเป็นจำนวนเต็มสตางค์ตั้งแต่ 1 ขึ้นไป')
    }
    if (!isWholeNumber(props.minSubtotalSatang) || props.minSubtotalSatang < 0 || props.minSubtotalSatang > MAX_AMOUNT_SATANG)
      throw invalid('ยอดขั้นต่ำต้องเป็นจำนวนเต็มสตางค์ที่ไม่ติดลบ')
    if (props.kind === 'bundle') {
      const scope = normalizeScope(props.scope)
      if (scope === null) throw invalid('แบบซื้อแถมต้องเลือกสินค้าหรือหมวดหมู่ที่ใช้')
      if (!validBundleQuantities(props.buyQuantity) || !validBundleQuantities(props.freeQuantity))
        throw invalid(`ของซื้อและของแถมต้องเป็นจำนวนเต็ม 1 ถึง ${MAX_BUNDLE_QUANTITY}`)
      if (props.value !== 0)
        throw invalid('แบบซื้อแถมไม่ใช้ค่าส่วนลด')
    }
    let couponCode: string | null = null
    if (props.couponCode !== null) {
      const code = normalizeCouponCode(props.couponCode)
      if (!COUPON_CODE_PATTERN.test(code)) throw invalid('รหัสคูปองต้องเป็นตัวอักษรภาษาอังกฤษ ตัวเลข หรือขีด 3 ถึง 20 ตัว')
      couponCode = code
    }
    const assertUseLimit = (value: number | null, message: string) => {
      if (value === null) return
      if (!isWholeNumber(value) || value < 1 || value > USE_LIMIT_MAX) throw invalid(message)
    }
    if (props.maxUsesPerMember !== null && props.audience !== 'members')
      throw invalid('จำกัดต่อสมาชิกใช้ได้กับโปรโมชันสำหรับสมาชิกเท่านั้น')
    assertUseLimit(props.maxUses, 'จำนวนครั้งที่ใช้ได้ต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป')
    assertUseLimit(props.maxUsesPerMember, 'จำกัดต่อสมาชิกต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป')

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
    this.couponCode = couponCode
    this.buyQuantity = props.kind === 'bundle' ? props.buyQuantity : null
    this.freeQuantity = props.kind === 'bundle' ? props.freeQuantity : null
    this.maxUses = props.maxUses
    this.maxUsesPerMember = props.maxUsesPerMember
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
      ...(this.couponCode !== null ? { couponCode: this.couponCode } : {}),
      ...(this.kind === 'bundle'
        ? { buyQuantity: this.buyQuantity ?? 0, freeQuantity: this.freeQuantity ?? 0 }
        : {}),
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
      couponCode: this.couponCode,
      buyQuantity: this.buyQuantity,
      freeQuantity: this.freeQuantity,
      maxUses: this.maxUses,
      maxUsesPerMember: this.maxUsesPerMember,
      imageKey: this.imageKey,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    }
  }
}
