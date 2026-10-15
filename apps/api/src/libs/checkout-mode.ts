export type CheckoutMode = 'legacy' | 'shifts'

/** Legacy preserves existing v1 payment clients until an owner explicitly cuts over. */
export function resolveCheckoutMode(value: string | undefined = Bun.env.CHECKOUT_MODE): CheckoutMode {
  if (value === undefined || value === '') return 'legacy'
  if (value === 'legacy' || value === 'shifts') return value
  throw new Error('CHECKOUT_MODE must be either legacy or shifts')
}
