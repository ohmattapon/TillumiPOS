import { DomainError } from './errors/domain-error'

export interface RegisterProps {
  id: number
  branchId: number
  code: string
  name: string
  isActive: boolean
}

const invalid = (detail: string) => new DomainError(detail, 'INVALID_REGISTER')

/** A physical point of sale that belongs to one branch for its entire lifetime. */
export class RegisterEntity {
  readonly id: number
  readonly branchId: number
  readonly code: string
  readonly name: string
  readonly isActive: boolean

  constructor(props: RegisterProps) {
    if (!Number.isInteger(props.id) || props.id < 0) throw invalid('จุดขายไม่ถูกต้อง')
    if (!Number.isInteger(props.branchId) || props.branchId < 1) throw invalid('สาขาของจุดขายไม่ถูกต้อง')
    if (!/^[A-Z0-9-]{1,20}$/.test(props.code)) throw invalid('รหัสจุดขายต้องเป็นตัวพิมพ์ใหญ่ ตัวเลข หรือขีดกลาง 1 ถึง 20 ตัว')
    this.validateName(props.name)
    this.id = props.id
    this.branchId = props.branchId
    this.code = props.code
    this.name = props.name
    this.isActive = props.isActive
  }

  rename(name: string): RegisterEntity {
    this.validateName(name)
    return new RegisterEntity({ ...this.toSnapshot(), name })
  }

  deactivate(): RegisterEntity {
    return new RegisterEntity({ ...this.toSnapshot(), isActive: false })
  }

  toSnapshot(): RegisterProps {
    return { id: this.id, branchId: this.branchId, code: this.code, name: this.name, isActive: this.isActive }
  }

  private validateName(name: string) {
    if (name.trim().length < 1 || name.length > 100) throw invalid('ชื่อจุดขายต้องยาว 1 ถึง 100 ตัวอักษร')
  }
}
