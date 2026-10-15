export interface ICheckoutPolicy {
  isShiftsEnabled(): Promise<boolean>
  /** Permanently activates shift checkout after the first successful shift is opened. */
  activateShifts(): Promise<void>
}
