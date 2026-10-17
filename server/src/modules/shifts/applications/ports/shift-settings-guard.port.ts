export interface IShiftSettingsGuard {
  assertCurrencyChangeAllowed(): Promise<void>
}

const token: unique symbol = Symbol('IShiftSettingsGuard')
export const shiftSettingsGuardToken = token.toString()
