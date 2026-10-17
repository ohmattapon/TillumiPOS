import { injectable } from 'tsyringe'
import { checkoutModeState } from '../../../infrastructure/database/schema/checkout-mode-state'
import { currentExecutor } from '../../../libs/transaction-context'
import { resolveCheckoutMode } from '../../../libs/checkout-mode'
import type { ICheckoutPolicy } from '../ports/checkout-policy.port'

@injectable()
export class EnvCheckoutPolicy implements ICheckoutPolicy {
  async isShiftsEnabled() {
    if (resolveCheckoutMode() === 'shifts') return true
    const [activation] = await currentExecutor().select({ id: checkoutModeState.id }).from(checkoutModeState).limit(1)
    return activation !== undefined
  }

  async activateShifts() {
    await currentExecutor().insert(checkoutModeState).values({ id: 1, shiftsActivatedAt: new Date() }).onConflictDoNothing()
  }
}
