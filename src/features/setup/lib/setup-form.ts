import { isPromptPayTarget } from '@pos/api/shop-settings'

/** Every text field is filled, the password is long enough and typed the same twice. The shop type is checked apart. */
export function isSetupFormFilled(form: Record<string, string> & { password: string; confirm: string }): boolean {
  return (
    Object.values(form).every((value) => value.trim() !== '') &&
    form.password.length >= 10 &&
    form.password === form.confirm
  )
}

/** The PromptPay number is optional: blank is fine, anything else must be a number the server accepts. */
export function isPromptPayAnswerValid(text: string): boolean {
  const target = text.trim()
  return target === '' || isPromptPayTarget(target)
}

/**
 * What to save once the owner is signed in: a shop that gave a PromptPay number takes it with a static QR.
 * Null when it was left blank, so the shop keeps the settings it has.
 */
export function promptPayChangesFor(text: string): { promptpayMode: 'static'; promptpayTarget: string } | null {
  const target = text.trim()
  return target === '' ? null : { promptpayMode: 'static', promptpayTarget: target }
}

/**
 * The setup code is Latin letters and digits, so Thai in that field means the keyboard is still on the Thai layout:
 * the same keys typed there give a different, always wrong, code.
 */
export function looksLikeThaiKeyboard(text: string): boolean {
  return /[\u0E00-\u0E7F]/.test(text)
}
