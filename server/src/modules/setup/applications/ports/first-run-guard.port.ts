/** Whether the shop has anyone who can sign in yet. Answered by the users module from its own data. */
export interface IFirstRunGuard {
  countUsers(): Promise<number>
  /**
   * Counts the users after taking a lock held until the surrounding unit of work ends, so two setups at
   * the same moment cannot both see an empty shop.
   */
  lockAndCountUsers(): Promise<number>
}

const firstRunGuardTokenSymbol: unique symbol = Symbol('IFirstRunGuard')
export const firstRunGuardToken = firstRunGuardTokenSymbol.toString()
