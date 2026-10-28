import { COUPON_CODE_PATTERN, MAX_BUNDLE_QUANTITY, normalizeCouponCode } from '@pos/api/promotions'

export type PromotionKind = 'fixed' | 'percent' | 'bundle'
export type PromotionAudience = 'everyone' | 'members'

/** What the owner has typed into the promotion form, as text; `toBody` turns it into what the API takes. */
export interface PromotionForm {
  name: string
  kind: PromotionKind
  /** Baht for a fixed promotion, percent for a percent one. */
  value: string
  /** How many the customer buys, and how many of those are free, for a bundle. */
  buyQuantity: string
  freeQuantity: string
  /** A coupon has to be typed at the till to apply; empty runs the promotion on its own. */
  couponCode: string
  /** How many times it may be used in all, and by one member. Empty is no limit. */
  maxUses: string
  maxUsesPerMember: string
  maxDiscount: string
  minSubtotal: string
  /** Civil dates, `YYYY-MM-DD`, or empty. */
  startsOn: string
  endsOn: string
  weekdays: number[]
  /** `HH:MM` or empty. */
  windowStart: string
  windowEnd: string
  audience: PromotionAudience
  isActive: boolean
}

export const emptyPromotionForm: PromotionForm = {
  name: '', kind: 'percent', value: '', buyQuantity: '', freeQuantity: '', couponCode: '',
  maxUses: '', maxUsesPerMember: '', maxDiscount: '', minSubtotal: '', startsOn: '', endsOn: '',
  weekdays: [], windowStart: '', windowEnd: '', audience: 'everyone', isActive: true,
}

/** How amounts in the shop currency are read and written (the shop's `money`). */
export interface AmountFormat {
  parse: (input: string) => number | null
  toInput: (satang: number) => string
}

export interface PromotionBody {
  name: string
  kind: PromotionKind
  value: number
  buyQuantity: number | null
  freeQuantity: number | null
  couponCode: string | null
  maxUses: number | null
  maxUsesPerMember: number | null
  maxDiscountSatang: number | null
  minSubtotalSatang: number
  startsOn: string | null
  endsOn: string | null
  weekdays: number[] | null
  windowStartMinute: number | null
  windowEndMinute: number | null
  audience: PromotionAudience
  isActive: boolean
}

export type FormProblem =
  | 'name' | 'value' | 'buyQuantity' | 'freeQuantity' | 'couponCode' | 'maxUses' | 'maxUsesPerMember'
  | 'maxDiscount' | 'minSubtotal' | 'dates' | 'window'

/** A whole number typed into a count field, or null when it is blank or not a number. */
function typedCount(input: string): number | null {
  const trimmed = input.trim()
  return /^\d{1,6}$/.test(trimmed) ? Number(trimmed) : null
}

/** `12.5` is 1250 basis points. Two decimals at most, from 0.01 to 100. */
export function percentToBp(input: string): number | null {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(input.trim())
  if (!match) return null
  const bp = Number(match[1]) * 100 + Number(((match[2] ?? '') + '00').slice(0, 2))
  return bp >= 1 && bp <= 10_000 ? bp : null
}

export function bpToPercent(bp: number): string {
  const whole = Math.floor(bp / 100)
  const fraction = bp % 100
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, '0').replace(/0$/, '')}`
}

export function minuteOf(time: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

export const timeOf = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

/** Short name of a weekday (0 = Sunday) in the shop's language. */
export function weekdayName(locale: string, day: number): string {
  // 2023-01-01 was a Sunday.
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + day)))
}

export function toBody(
  form: PromotionForm,
  amounts: AmountFormat,
): { ok: true; body: PromotionBody } | { ok: false; problems: FormProblem[] } {
  const problems: FormProblem[] = []

  const name = form.name.trim()
  if (name.length < 1 || name.length > 80) problems.push('name')

  // A bundle has no typed value: its discount is the free items the buy/free fields name.
  const bundle = form.kind === 'bundle'
  const value = bundle ? 0 : form.kind === 'percent' ? percentToBp(form.value) : amounts.parse(form.value)
  if (!bundle && (value === null || value < 1)) problems.push('value')

  const buyQuantity = bundle ? typedCount(form.buyQuantity) : null
  const freeQuantity = bundle ? typedCount(form.freeQuantity) : null
  const badQuantity = (quantity: number | null) => quantity === null || quantity < 1 || quantity > MAX_BUNDLE_QUANTITY
  if (bundle && badQuantity(buyQuantity)) problems.push('buyQuantity')
  if (bundle && badQuantity(freeQuantity)) problems.push('freeQuantity')

  // The code is stored upper-case, so the same coupon is the same code however it was typed.
  const typedCode = normalizeCouponCode(form.couponCode)
  if (typedCode !== '' && !COUPON_CODE_PATTERN.test(typedCode)) problems.push('couponCode')

  const maxUses = form.maxUses.trim() === '' ? null : typedCount(form.maxUses)
  if (form.maxUses.trim() !== '' && (maxUses === null || maxUses < 1)) problems.push('maxUses')

  // Only a members-only promotion can be limited per member, so what was typed before the audience
  // changed is dropped rather than sent as a limit the API would refuse.
  const perMemberTyped = form.audience === 'members' && form.maxUsesPerMember.trim() !== ''
  const maxUsesPerMember = perMemberTyped ? typedCount(form.maxUsesPerMember) : null
  if (perMemberTyped && (maxUsesPerMember === null || maxUsesPerMember < 1)) problems.push('maxUsesPerMember')

  // A cap belongs to percent promotions only; what was typed before the kind changed is dropped.
  const typedCap = form.kind === 'percent' && form.maxDiscount.trim() !== ''
  const maxDiscount = typedCap ? amounts.parse(form.maxDiscount) : null
  if (typedCap && (maxDiscount === null || maxDiscount < 1)) problems.push('maxDiscount')

  const minSubtotal = form.minSubtotal.trim() === '' ? 0 : amounts.parse(form.minSubtotal)
  if (minSubtotal === null || minSubtotal < 0) problems.push('minSubtotal')

  if (form.startsOn !== '' && form.endsOn !== '' && form.startsOn > form.endsOn) problems.push('dates')

  const start = form.windowStart === '' ? null : minuteOf(form.windowStart)
  const end = form.windowEnd === '' ? null : minuteOf(form.windowEnd)
  const oneEnd = (form.windowStart === '') !== (form.windowEnd === '')
  const badTime = (form.windowStart !== '' && start === null) || (form.windowEnd !== '' && end === null)
  if (oneEnd || badTime || (start !== null && start === end)) problems.push('window')

  if (problems.length > 0) return { ok: false, problems }
  return {
    ok: true,
    body: {
      name,
      kind: form.kind,
      value: value!,
      buyQuantity: bundle ? buyQuantity : null,
      freeQuantity: bundle ? freeQuantity : null,
      couponCode: typedCode === '' ? null : typedCode,
      maxUses,
      maxUsesPerMember,
      maxDiscountSatang: maxDiscount,
      minSubtotalSatang: minSubtotal!,
      startsOn: form.startsOn === '' ? null : form.startsOn,
      endsOn: form.endsOn === '' ? null : form.endsOn,
      weekdays: form.weekdays.length === 0 ? null : [...new Set(form.weekdays)].sort((a, b) => a - b),
      windowStartMinute: start,
      windowEndMinute: end,
      audience: form.audience,
      isActive: form.isActive,
    },
  }
}

/** The form for a stored promotion: what the owner would have typed to make it. */
export function fromPromotion(
  promotion: {
    name: string
    kind: PromotionKind
    value: number
    buyQuantity?: number | null
    freeQuantity?: number | null
    couponCode?: string | null
    maxUses?: number | null
    maxUsesPerMember?: number | null
    maxDiscountSatang: number | null
    minSubtotalSatang: number
    startsOn: string | null
    endsOn: string | null
    weekdays: readonly number[] | null
    windowStartMinute: number | null
    windowEndMinute: number | null
    audience: PromotionAudience
    isActive: boolean
  },
  amounts: AmountFormat,
): PromotionForm {
  return {
    name: promotion.name,
    kind: promotion.kind,
    value:
      promotion.kind === 'bundle'
        ? ''
        : promotion.kind === 'percent'
          ? bpToPercent(promotion.value)
          : amounts.toInput(promotion.value),
    // The count of a bundle, and the limits, came with Task 5 of the plan; a stored promotion
    // that has none shows empty fields.
    buyQuantity: promotion.buyQuantity == null ? '' : String(promotion.buyQuantity),
    freeQuantity: promotion.freeQuantity == null ? '' : String(promotion.freeQuantity),
    couponCode: promotion.couponCode ?? '',
    maxUses: promotion.maxUses == null ? '' : String(promotion.maxUses),
    maxUsesPerMember: promotion.maxUsesPerMember == null ? '' : String(promotion.maxUsesPerMember),
    maxDiscount: promotion.maxDiscountSatang === null ? '' : amounts.toInput(promotion.maxDiscountSatang),
    minSubtotal: promotion.minSubtotalSatang === 0 ? '' : amounts.toInput(promotion.minSubtotalSatang),
    startsOn: promotion.startsOn ?? '',
    endsOn: promotion.endsOn ?? '',
    weekdays: promotion.weekdays ? [...promotion.weekdays] : [],
    windowStart: promotion.windowStartMinute === null ? '' : timeOf(promotion.windowStartMinute),
    windowEnd: promotion.windowEndMinute === null ? '' : timeOf(promotion.windowEndMinute),
    audience: promotion.audience,
    isActive: promotion.isActive,
  }
}
