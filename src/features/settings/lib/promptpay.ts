import type { ShopSettings } from '@pos/api/types'

export type PromptPayMode = ShopSettings['promptpayMode']

/**
 * A PromptPay identifier: a 10-digit mobile number starting with 0, or a 13-digit citizen id.
 * Mirrors the server rule (`isPromptPayTarget` in `shop-settings.domain.ts`) so the form
 * refuses the same values the API would reject. Digits only: no dashes or spaces inside.
 */
export function isPromptPayTargetValid(value: string): boolean {
  return /^\d+$/.test(value) && (value.length === 13 || (value.length === 10 && value.startsWith('0')))
}

/** Blank input means "not set up" and is stored as null. Anything else is trimmed. */
export function normalizePromptPayTarget(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Static mode without a target is saveable on purpose: saving never blocks, the POS warns
 * at pay time instead. Only a non-blank but malformed target blocks saving.
 */
export function canSavePromptPay(_mode: PromptPayMode, targetText: string): boolean {
  const target = normalizePromptPayTarget(targetText)
  return target === null || isPromptPayTargetValid(target)
}
