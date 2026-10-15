import { DomainError } from './errors/domain-error'

export interface KitchenStationProps {
  id: number
  name: string
  sortOrder: number
  isActive: boolean
}

export type KitchenStationChanges = Partial<Omit<KitchenStationProps, 'id'>>

export const MAX_STATION_NAME_LENGTH = 50

/** A place that prepares orders, such as the kitchen or the bar. Shared by every branch of the shop. */
export class KitchenStationEntity {
  public readonly id: number
  public readonly name: string
  public readonly sortOrder: number
  public readonly isActive: boolean

  constructor(props: KitchenStationProps) {
    const name = props.name.trim()
    if (name.length < 1 || name.length > MAX_STATION_NAME_LENGTH)
      throw new DomainError(`ชื่อสถานีต้องยาว 1 ถึง ${MAX_STATION_NAME_LENGTH} ตัวอักษร`, 'INVALID_KITCHEN_STATION')
    if (!Number.isInteger(props.sortOrder)) throw new DomainError('ลำดับต้องเป็นจำนวนเต็ม', 'INVALID_KITCHEN_STATION')
    this.id = props.id
    this.name = name
    this.sortOrder = props.sortOrder
    this.isActive = props.isActive
  }

  /** A copy with the given fields changed; `undefined` keeps the current value. */
  with(changes: KitchenStationChanges): KitchenStationEntity {
    const defined = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined))
    return new KitchenStationEntity({ ...this.toSnapshot(), ...defined })
  }

  toSnapshot(): KitchenStationProps {
    return { id: this.id, name: this.name, sortOrder: this.sortOrder, isActive: this.isActive }
  }
}
