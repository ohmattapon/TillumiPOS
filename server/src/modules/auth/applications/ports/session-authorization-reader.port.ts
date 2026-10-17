import type { UserEntity } from '../../../../domains/user.domain'
import type { Permission } from '../../../../domains/permission.vo'

export interface SessionAuthorization {
  user: UserEntity
  roleName: string
  permissions: readonly Permission[]
}
export interface ISessionAuthorizationReader {
  findActiveById(userId: number): Promise<SessionAuthorization | null>
}
export const sessionAuthorizationReaderToken = Symbol('ISessionAuthorizationReader').toString()
