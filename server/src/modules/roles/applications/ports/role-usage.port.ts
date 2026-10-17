/** The users module counts every user holding a role, including inactive users. */
export interface IRoleUsage { countUsers(roleId: number): Promise<number> }
export const roleUsageToken = Symbol('IRoleUsage').toString()
