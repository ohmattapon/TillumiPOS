import type { UserEntity } from '../../../../domains/user.domain'

export interface IUserCredentials {
  user: UserEntity
  passwordHash: string
}

export interface IUserRepository {
  /** Serializes owner demotion/deactivation before locking any individual user. */
  lockOwnerChangesForUpdate(): Promise<void>
  /** Every user, ordered by id. */
  findAll(): Promise<UserEntity[]>
  findById(id: number): Promise<UserEntity | null>
  /** Like findById, but row-locks the user until the surrounding unit of work ends. */
  findByIdForUpdate(id: number): Promise<UserEntity | null>
  /** Null when the user does not exist or has been deactivated. */
  findActiveById(id: number): Promise<UserEntity | null>
  /** The only way to read a password hash. `username` must already be normalized. */
  findCredentialsByUsername(username: string): Promise<IUserCredentials | null>
  /** Throws DomainConflictError when the username is taken. */
  create(entity: UserEntity, passwordHash: string): Promise<UserEntity>
  /** Overwrites the stored user; the password changes only when a new hash is given. */
  update(entity: UserEntity, passwordHash?: string): Promise<UserEntity>
  countActiveOwners(): Promise<number>
  /** How many users who can sign in work in this branch. */
  countActiveInBranch(branchId: number): Promise<number>
}

const userRepositoryTokenSymbol: unique symbol = Symbol('IUserRepository')
export const userRepositoryToken = userRepositoryTokenSymbol.toString()
