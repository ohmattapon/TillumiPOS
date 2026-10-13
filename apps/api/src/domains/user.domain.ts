import { DomainError } from './errors/domain-error'
import { isUserRole, type UserRole } from './user-role.vo'

export interface UserEntityProps {
  /** 0 until the user has been stored. */
  id: number
  username: string
  displayName: string
  role: UserRole
  isActive: boolean
}

export type UserChanges = Partial<Pick<UserEntityProps, 'displayName' | 'role' | 'isActive'>>

const USERNAME_PATTERN = /^[a-z0-9_.-]{3,32}$/
const MAX_DISPLAY_NAME_LENGTH = 100

/** A person who can sign in. Credentials are deliberately not part of the entity. */
export class UserEntity {
  public readonly id: number
  public readonly username: string
  public readonly displayName: string
  public readonly role: UserRole
  public readonly isActive: boolean

  constructor(props: UserEntityProps) {
    if (!USERNAME_PATTERN.test(props.username))
      throw new DomainError('ชื่อผู้ใช้ต้องยาว 3 ถึง 32 ตัว และใช้ได้เฉพาะ a-z 0-9 _ . -', 'INVALID_USER')
    if (props.displayName.length < 1 || props.displayName.length > MAX_DISPLAY_NAME_LENGTH)
      throw new DomainError(`ชื่อที่แสดงต้องยาว 1 ถึง ${MAX_DISPLAY_NAME_LENGTH} ตัวอักษร`, 'INVALID_USER')
    if (!isUserRole(props.role)) throw new DomainError('บทบาทไม่ถูกต้อง', 'INVALID_USER')

    this.id = props.id
    this.username = props.username
    this.displayName = props.displayName
    this.role = props.role
    this.isActive = props.isActive
  }

  /** Usernames are stored and compared in lower case. */
  static normalizeUsername(raw: string): string {
    return raw.toLowerCase()
  }

  /** A copy with the given fields changed; undefined fields keep their current value. */
  with(changes: UserChanges): UserEntity {
    return new UserEntity({
      id: this.id,
      username: this.username,
      displayName: changes.displayName ?? this.displayName,
      role: changes.role ?? this.role,
      isActive: changes.isActive ?? this.isActive,
    })
  }

  /** Whether applying the changes would remove an owner who can currently sign in. */
  wouldStopBeingActiveOwner(changes: UserChanges): boolean {
    if (this.role !== 'owner' || !this.isActive) return false
    const after = this.with(changes)
    return after.role !== 'owner' || !after.isActive
  }

  toSnapshot(): UserEntityProps {
    return {
      id: this.id,
      username: this.username,
      displayName: this.displayName,
      role: this.role,
      isActive: this.isActive,
    }
  }
}
