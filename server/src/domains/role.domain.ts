import { DomainConflictError } from './errors/domain-conflict.error'
import { DomainError } from './errors/domain-error'
import { isPermission, type Permission } from './permission.vo'

export const MAX_ROLE_NAME_LENGTH = 60
export type SystemRoleKey = 'owner' | 'cashier'

export interface RoleEntityProps {
  /** 0 until stored. */
  id: number
  name: string
  systemKey: SystemRoleKey | null
  permissions: readonly Permission[]
}

const protectedRole = () => new DomainConflictError('บทบาทของระบบแก้ไขส่วนนี้ไม่ได้', 'ROLE_PROTECTED')

/** A named permission set. System roles cannot be renamed or removed. */
export class RoleEntity {
  readonly id: number
  readonly name: string
  readonly systemKey: SystemRoleKey | null
  readonly permissions: readonly Permission[]

  constructor(props: RoleEntityProps) {
    const name = props.name.trim()
    if (name.length < 1 || name.length > MAX_ROLE_NAME_LENGTH)
      throw new DomainError(`ชื่อบทบาทต้องยาว 1 ถึง ${MAX_ROLE_NAME_LENGTH} ตัวอักษร`, 'INVALID_ROLE')
    if (!props.permissions.every(isPermission)) throw new DomainError('สิทธิ์ไม่ถูกต้อง', 'INVALID_ROLE')
    this.id = props.id
    this.name = name
    this.systemKey = props.systemKey
    this.permissions = [...new Set(props.permissions)].sort()
  }

  get isSystem() {
    return this.systemKey !== null
  }

  get isOwner() {
    return this.systemKey === 'owner'
  }

  with(changes: { name?: string; permissions?: readonly Permission[] }): RoleEntity {
    if (this.isSystem && changes.name !== undefined && changes.name.trim() !== this.name) throw protectedRole()
    if (this.isOwner && changes.permissions !== undefined) throw protectedRole()
    return new RoleEntity({ id: this.id, name: changes.name ?? this.name, systemKey: this.systemKey, permissions: changes.permissions ?? this.permissions })
  }

  toSnapshot(): RoleEntityProps {
    return { id: this.id, name: this.name, systemKey: this.systemKey, permissions: [...this.permissions] }
  }
}
