import { DomainError } from './errors/domain-error'

export interface SlideEntityProps {
  /** 0 until the slide has been stored. */
  id: number
  imageKey: string
  sortOrder: number
  isActive: boolean
}

const invalid = (message: string) => new DomainError(message, 'INVALID_SLIDE')
// Keys are produced by the upload as slides/<uuid>.<ext>; nothing else is ever stored.
const KEY_PATTERN = /^slides\/[A-Za-z0-9-]+\.(jpg|png|webp)$/

export class SlideEntity {
  public readonly id: number
  public readonly imageKey: string
  public readonly sortOrder: number
  public readonly isActive: boolean

  constructor(props: SlideEntityProps) {
    if (!KEY_PATTERN.test(props.imageKey))
      throw invalid('รูปสไลด์ต้องอยู่ใต้ slides/ และเป็นไฟล์ JPEG, PNG หรือ WebP')
    if (!Number.isInteger(props.sortOrder) || props.sortOrder < 0)
      throw invalid('ลำดับการแสดงผลต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป')

    this.id = props.id
    this.imageKey = props.imageKey
    this.sortOrder = props.sortOrder
    this.isActive = props.isActive
  }

  /** A copy with the given fields changed; undefined fields keep their current value. */
  with(changes: Partial<Omit<SlideEntityProps, 'id'>>): SlideEntity {
    return new SlideEntity({
      id: this.id,
      imageKey: changes.imageKey ?? this.imageKey,
      sortOrder: changes.sortOrder ?? this.sortOrder,
      isActive: changes.isActive ?? this.isActive,
    })
  }

  toSnapshot(): SlideEntityProps {
    return { id: this.id, imageKey: this.imageKey, sortOrder: this.sortOrder, isActive: this.isActive }
  }
}
