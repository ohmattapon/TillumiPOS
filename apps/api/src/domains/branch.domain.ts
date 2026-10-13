import { DomainError } from './errors/domain-error'

export interface BranchEntityProps {
  /** 0 until the branch has been stored. */
  id: number
  /** Short, upper-case and unique: it prefixes every receipt number of the branch. */
  code: string
  name: string
  address: string | null
  phone: string | null
  isActive: boolean
}

export type BranchChanges = Partial<Omit<BranchEntityProps, 'id' | 'code'>>

const CODE_PATTERN = /^[A-Z0-9]{2,10}$/
const MAX_NAME_LENGTH = 100
const MAX_ADDRESS_LENGTH = 500
const MAX_PHONE_LENGTH = 30

const invalid = (message: string) => new DomainError(message, 'INVALID_BRANCH')

/** A place the shop sells from. Stock, sales and receipt numbers belong to one branch. */
export class BranchEntity {
  public readonly id: number
  public readonly code: string
  public readonly name: string
  public readonly address: string | null
  public readonly phone: string | null
  public readonly isActive: boolean

  constructor(props: BranchEntityProps) {
    if (!CODE_PATTERN.test(props.code)) throw invalid('รหัสสาขาต้องเป็น A-Z หรือ 0-9 ยาว 2 ถึง 10 ตัว')
    if (props.name.length < 1 || props.name.length > MAX_NAME_LENGTH)
      throw invalid(`ชื่อสาขาต้องยาว 1 ถึง ${MAX_NAME_LENGTH} ตัวอักษร`)
    if (props.address !== null && props.address.length > MAX_ADDRESS_LENGTH)
      throw invalid(`ที่อยู่ต้องไม่เกิน ${MAX_ADDRESS_LENGTH} ตัวอักษร`)
    if (props.phone !== null && props.phone.length > MAX_PHONE_LENGTH)
      throw invalid(`เบอร์โทรต้องไม่เกิน ${MAX_PHONE_LENGTH} ตัวอักษร`)

    this.id = props.id
    this.code = props.code
    this.name = props.name
    this.address = props.address
    this.phone = props.phone
    this.isActive = props.isActive
  }

  /** Codes are stored and compared in upper case. */
  static normalizeCode(raw: string): string {
    return raw.trim().toUpperCase()
  }

  /**
   * A copy with the given fields changed. `undefined` keeps the current value;
   * `null` is a real value for address and phone (it clears them). The code never changes.
   */
  with(changes: BranchChanges): BranchEntity {
    return new BranchEntity({
      id: this.id,
      code: this.code,
      name: changes.name ?? this.name,
      address: changes.address === undefined ? this.address : changes.address,
      phone: changes.phone === undefined ? this.phone : changes.phone,
      isActive: changes.isActive ?? this.isActive,
    })
  }

  toSnapshot(): BranchEntityProps {
    return {
      id: this.id,
      code: this.code,
      name: this.name,
      address: this.address,
      phone: this.phone,
      isActive: this.isActive,
    }
  }
}
