import { CategoryEntity, type CategoryEntityProps } from '../domains/category.domain'
import { UserEntity, type UserEntityProps } from '../domains/user.domain'

export const makeCategory = (overrides: Partial<CategoryEntityProps> = {}) =>
  new CategoryEntity({ id: 1, name: 'เครื่องดื่ม', sortOrder: 0, isActive: true, ...overrides })

export const makeUser = (overrides: Partial<UserEntityProps> = {}) =>
  new UserEntity({ id: 1, username: 'somchai', displayName: 'สมชาย', role: 'cashier', isActive: true, ...overrides })
