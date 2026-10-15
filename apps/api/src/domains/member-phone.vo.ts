import { DomainError } from './errors/domain-error'

/** Canonical identity only; formatting does not verify ownership of a phone. */
export class MemberPhone {
  readonly value: string

  constructor(input: string) {
    let normalized = input.replace(/[\s()\-]/g, '')
    if (!/^\+?\d{8,15}$/.test(normalized))
      throw new DomainError('เบอร์โทรต้องเป็นตัวเลข 8 ถึง 15 หลัก', 'INVALID_MEMBER_PHONE')
    if (/^\+?66\d{9}$/.test(normalized)) normalized = `0${normalized.replace(/^\+?66/, '')}`
    this.value = normalized
  }
}
