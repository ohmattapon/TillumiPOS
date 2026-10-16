import { DomainConflictError } from './errors/domain-conflict.error'
import { DomainNotFoundError } from './errors/domain-not-found.error'

/**
 * What a customer's screen follows: one register of a branch, or the branch itself when the shop has no
 * registers (the older checkout mode). Several screens may follow the same target.
 */
export interface DisplayTarget {
  branchId: number
  registerId: number | null
}

export const targetKey = (target: DisplayTarget) => `${target.branchId}:${target.registerId ?? 'branch'}`

export const PAIRING_CODE_LENGTH = 6
/** A code that has not been entered at a till stops working after this long. */
export const PAIRING_CODE_VALID_MS = 10 * 60_000

export const isPairingCode = (value: string) => /^\d{6}$/.test(value)

/** Screens that ask for a code can be created by anyone, so only this many may wait for a till at once. */
export const MAX_WAITING_SESSIONS = 200

export type DisplaySessionStatus = 'waiting' | 'paired'

export interface DisplaySessionProps {
  id: string
  /** Held by the screen only: it is what lets that screen read its own stream. */
  token: string
  /** What the cashier types at the till. Meaningful only while the screen waits. */
  code: string
  createdAt: Date
  target: DisplayTarget | null
}

/**
 * One customer's screen, from the moment it asks for a code to the moment it follows a till. The sale it
 * shows is not kept here: this is only who the screen is and what it follows.
 */
export class DisplaySessionEntity {
  public readonly id: string
  public readonly token: string
  public readonly code: string
  public readonly createdAt: Date
  public readonly target: DisplayTarget | null

  constructor(props: DisplaySessionProps) {
    this.id = props.id
    this.token = props.token
    this.code = props.code
    this.createdAt = props.createdAt
    this.target = props.target === null ? null : { ...props.target }
  }

  get status(): DisplaySessionStatus {
    return this.target === null ? 'waiting' : 'paired'
  }

  get expiresAt(): Date {
    return new Date(this.createdAt.getTime() + PAIRING_CODE_VALID_MS)
  }

  /** Only a screen still waiting runs out; a paired one lives while its stream does. */
  isExpired(now: Date): boolean {
    return this.status === 'waiting' && now.getTime() >= this.expiresAt.getTime()
  }

  pair(target: DisplayTarget, now: Date): DisplaySessionEntity {
    if (this.status === 'paired')
      throw new DomainConflictError('จอนี้ถูกเชื่อมต่อแล้ว', 'DISPLAY_ALREADY_PAIRED')
    if (this.isExpired(now)) throw new DomainNotFoundError('ไม่พบจอที่ใช้รหัสนี้', 'DISPLAY_CODE_NOT_FOUND')
    return new DisplaySessionEntity({ ...this.toSnapshot(), target })
  }

  toSnapshot(): DisplaySessionProps {
    return {
      id: this.id,
      token: this.token,
      code: this.code,
      createdAt: this.createdAt,
      target: this.target === null ? null : { ...this.target },
    }
  }
}
