export const USER_ROLES = ['owner', 'cashier'] as const

export type UserRole = (typeof USER_ROLES)[number]

export const isUserRole = (value: unknown): value is UserRole => USER_ROLES.includes(value as UserRole)
