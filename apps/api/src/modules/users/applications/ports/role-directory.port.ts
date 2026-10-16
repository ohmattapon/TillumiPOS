export interface RoleRef {
  id: number
  name: string
  systemKey: 'owner' | 'cashier' | null
}

/** The roles module supplies the role references needed by users. */
export interface IRoleDirectory {
  findById(id: number): Promise<RoleRef | null>
  findBySystemKey(key: 'owner' | 'cashier'): Promise<RoleRef>
}

const roleDirectoryTokenSymbol: unique symbol = Symbol('IRoleDirectory')
export const roleDirectoryToken = roleDirectoryTokenSymbol.toString()
