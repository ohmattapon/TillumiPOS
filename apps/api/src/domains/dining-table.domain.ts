import { DomainError } from './errors/domain-error'

/** The floor plan is drawn in these units, whatever size the screen is. */
export const LAYOUT_WIDTH = 1000
export const LAYOUT_HEIGHT = 700
export const MIN_TABLE_SIZE = 40
export const MAX_SEATS = 99
const MAX_TEXT_LENGTH = 50

const invalid = (message: string) => new DomainError(message, 'INVALID_TABLE')
const isWhole = (value: number) => Number.isInteger(value)
const definedOnly = <T extends object>(changes: T) =>
  Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)) as T

export interface DiningTableProps {
  /** 0 until the table has been stored. */
  id: number
  branchId: number
  name: string
  zone: string | null
  seats: number
  /** Position and size on the floor plan, in layout units. */
  x: number
  y: number
  width: number
  height: number
  sortOrder: number
  isActive: boolean
}

export class DiningTableEntity {
  public readonly id: number
  public readonly branchId: number
  public readonly name: string
  public readonly zone: string | null
  public readonly seats: number
  public readonly x: number
  public readonly y: number
  public readonly width: number
  public readonly height: number
  public readonly sortOrder: number
  public readonly isActive: boolean

  constructor(props: DiningTableProps) {
    if (props.name.length < 1 || props.name.length > MAX_TEXT_LENGTH)
      throw invalid(`ชื่อโต๊ะต้องยาว 1 ถึง ${MAX_TEXT_LENGTH} ตัวอักษร`)
    if (props.zone !== null && (props.zone.length < 1 || props.zone.length > MAX_TEXT_LENGTH))
      throw invalid(`ชื่อโซนต้องยาว 1 ถึง ${MAX_TEXT_LENGTH} ตัวอักษร`)
    if (!isWhole(props.seats) || props.seats < 1 || props.seats > MAX_SEATS)
      throw invalid(`จำนวนที่นั่งต้องเป็นจำนวนเต็ม 1 ถึง ${MAX_SEATS}`)
    if (![props.x, props.y, props.width, props.height].every(isWhole))
      throw invalid('ตำแหน่งและขนาดของโต๊ะต้องเป็นจำนวนเต็ม')
    if (props.width < MIN_TABLE_SIZE || props.height < MIN_TABLE_SIZE)
      throw invalid(`โต๊ะต้องกว้างและสูงอย่างน้อย ${MIN_TABLE_SIZE}`)
    if (props.x < 0 || props.y < 0 || props.x + props.width > LAYOUT_WIDTH || props.y + props.height > LAYOUT_HEIGHT)
      throw invalid('โต๊ะต้องอยู่ในพื้นที่ของผัง')
    if (!isWhole(props.sortOrder)) throw invalid('ลำดับการแสดงผลต้องเป็นจำนวนเต็ม')

    this.id = props.id
    this.branchId = props.branchId
    this.name = props.name
    this.zone = props.zone
    this.seats = props.seats
    this.x = props.x
    this.y = props.y
    this.width = props.width
    this.height = props.height
    this.sortOrder = props.sortOrder
    this.isActive = props.isActive
  }

  /** A copy with the given fields changed; undefined fields keep their current value. */
  with(changes: Partial<Omit<DiningTableProps, 'id' | 'branchId'>>): DiningTableEntity {
    return new DiningTableEntity({ ...this.toSnapshot(), ...definedOnly(changes) })
  }

  toSnapshot(): DiningTableProps {
    return {
      id: this.id,
      branchId: this.branchId,
      name: this.name,
      zone: this.zone,
      seats: this.seats,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      sortOrder: this.sortOrder,
      isActive: this.isActive,
    }
  }
}
