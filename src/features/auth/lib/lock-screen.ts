/** Why the lock screen is asked to close: the person at the till, or a switch that has just succeeded. */
export type LockScreenCloseReason = 'user' | 'hand-over'

/**
 * Nobody may close the lock screen while a switch is in flight, but the hand-over itself always closes it:
 * it runs inside the switch's onSuccess, which TanStack Query awaits while the mutation still reports pending.
 */
export const lockScreenMayClose = (reason: LockScreenCloseReason, isSwitchPending: boolean): boolean =>
  reason === 'hand-over' || !isSwitchPending
