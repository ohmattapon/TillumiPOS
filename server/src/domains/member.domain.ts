import { DomainConflictError } from './errors/domain-conflict.error'
import { DomainError } from './errors/domain-error'
import { MemberPhone } from './member-phone.vo'

export interface MemberEntityProps {
  id: number
  name: string
  phone: string
  isActive: boolean
  /** The member's points, kept as the sum of the ledger. Only the ledger writes it. */
  pointsBalance?: number
  createdAt: Date
  updatedAt: Date
}
export interface MemberSnapshot extends Omit<MemberEntityProps, 'pointsBalance'> {
  code: string
  /** Always a number on the way out: a member with no ledger rows has no balance yet. */
  pointsBalance: number
}

export class MemberEntity {
  readonly id: number
  readonly code: string
  readonly name: string
  readonly phone: string
  readonly isActive: boolean
  readonly pointsBalance: number
  readonly createdAt: Date
  readonly updatedAt: Date

  constructor(props: MemberEntityProps) {
    const name = props.name.trim()
    if (name.length < 1 || name.length > 120)
      throw new DomainError('ชื่อสมาชิกต้องยาว 1 ถึง 120 ตัวอักษร', 'INVALID_MEMBER')
    this.id = props.id
    this.code = `M${String(props.id).padStart(6, '0')}`
    this.name = name
    this.phone = new MemberPhone(props.phone).value
    this.isActive = props.isActive
    // A member created before points existed has no balance of its own until the ledger gives it one.
    this.pointsBalance = props.pointsBalance ?? 0
    this.createdAt = props.createdAt
    this.updatedAt = props.updatedAt
  }

  assertActive(): void {
    if (!this.isActive) throw new DomainConflictError('สมาชิกนี้ปิดใช้งานแล้ว กรุณาเลือกสมาชิกใหม่หรือล้างสมาชิก', 'MEMBER_INACTIVE')
  }

  with(changes: Partial<Pick<MemberEntityProps, 'name' | 'phone' | 'isActive'>>, now: Date): MemberEntity {
    return new MemberEntity({ ...this.toSnapshot(), name: changes.name ?? this.name, phone: changes.phone ?? this.phone, isActive: changes.isActive ?? this.isActive, updatedAt: now })
  }

  toSnapshot(): MemberSnapshot {
    return {
      id: this.id,
      code: this.code,
      name: this.name,
      phone: this.phone,
      isActive: this.isActive,
      pointsBalance: this.pointsBalance,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    }
  }
}
