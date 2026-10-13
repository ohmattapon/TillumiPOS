/** DI tokens for ports shared by more than one module. Module-owned tokens live beside their port. */
export const TOKENS = {
  UnitOfWork: Symbol('IUnitOfWork').toString(),
  PasswordHasher: Symbol('IPasswordHasher').toString(),
  MediaStorage: Symbol('IMediaStorage').toString(),
  Clock: Symbol('IClock').toString(),
} as const
