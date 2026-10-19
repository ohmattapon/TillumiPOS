import { injectable } from 'tsyringe'
import { resolveCheckoutMode } from '../../../libs/checkout-mode'
import type { ICheckoutPolicy } from '../ports/checkout-policy.port'

/**
 * No-database checkout policy: the one-shot shift activation lives in a
 * boolean instead of the checkout_mode_state table. The CHECKOUT_MODE
 * environment switch is read at call time, like the drizzle twin.
 */
@injectable()
export class MemoryCheckoutPolicy implements ICheckoutPolicy {
  private shiftsActivated = false

  async isShiftsEnabled() {
    if (resolveCheckoutMode() === 'shifts') return true
    return this.shiftsActivated
  }

  async activateShifts() {
    this.shiftsActivated = true
  }
}
