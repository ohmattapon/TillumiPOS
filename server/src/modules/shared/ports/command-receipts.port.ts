export interface CommandScope {
  actorId: number
  branchId: number
  action: string
  key: string
}

export interface ICommandReceipts {
  /** Serializes requests with a matching scope/key, including when no receipt exists yet. Requires a transaction. */
  lock(scope: CommandScope): Promise<void>
  find(scope: CommandScope): Promise<{ requestHash: string; result: unknown } | null>
  create(scope: CommandScope, requestHash: string, result: unknown): Promise<void>
}

const token: unique symbol = Symbol('ICommandReceipts')
export const commandReceiptsToken = token.toString()
