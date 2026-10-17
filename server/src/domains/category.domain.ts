import { DomainError } from './errors/domain-error'

export interface CategoryEntityProps {
  /** 0 until the category has been stored. */
  id: number
  name: string
  sortOrder: number
  isActive: boolean
}

const MAX_NAME_LENGTH = 100

export class CategoryEntity {
  public readonly id: number
  public readonly name: string
  public readonly sortOrder: number
  public readonly isActive: boolean

  constructor(props: CategoryEntityProps) {
    if (props.name.length < 1 || props.name.length > MAX_NAME_LENGTH)
      throw new DomainError(`ชื่อหมวดหมู่ต้องยาว 1 ถึง ${MAX_NAME_LENGTH} ตัวอักษร`, 'INVALID_CATEGORY')
    if (!Number.isInteger(props.sortOrder))
      throw new DomainError('ลำดับการแสดงผลต้องเป็นจำนวนเต็ม', 'INVALID_CATEGORY')

    this.id = props.id
    this.name = props.name
    this.sortOrder = props.sortOrder
    this.isActive = props.isActive
  }

  /** A copy with the given fields changed; undefined fields keep their current value. */
  with(changes: Partial<Omit<CategoryEntityProps, 'id'>>): CategoryEntity {
    return new CategoryEntity({
      id: this.id,
      name: changes.name ?? this.name,
      sortOrder: changes.sortOrder ?? this.sortOrder,
      isActive: changes.isActive ?? this.isActive,
    })
  }

  toSnapshot(): CategoryEntityProps {
    return { id: this.id, name: this.name, sortOrder: this.sortOrder, isActive: this.isActive }
  }
}
