import { injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { MemberEntity, type MemberEntityProps } from '../../../../domains/member.domain'
import type { IMemberRepository, MemberListQuery } from '../../applications/ports/member.repository'

const duplicate = () => new DomainConflictError('เบอร์โทรนี้มีสมาชิกอยู่แล้ว กรุณาใช้สมาชิกเดิม', 'DUPLICATE_MEMBER_PHONE')

// The code is derived from the id by the entity, so only the constructor props are stored.
const propsOf = (entity: MemberEntity): Omit<MemberEntityProps, 'id'> => {
  const { code: _derived, id: _unassigned, ...props } = entity.toSnapshot()
  return props
}

/** No-database member store: one Map, ids assigned from 1 in creation order. */
@injectable()
export class MemoryMemberRepository implements IMemberRepository {
  private readonly rows = new Map<number, MemberEntityProps>()
  private nextId = 1

  async find(query: MemberListQuery) {
    const term = query.search?.toLowerCase()
    const matching = [...this.rows.values()].filter(
      (row) =>
        (query.isActive === undefined || row.isActive === query.isActive) &&
        (!term ||
          row.name.toLowerCase().includes(term) ||
          row.phone.toLowerCase().includes(term) ||
          new MemberEntity(row).code.toLowerCase().includes(term)),
    )
    const ordered = [...matching].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id - b.id))
    return {
      items: ordered.slice(query.offset, query.offset + query.limit).map((row) => new MemberEntity(row)),
      total: matching.length,
    }
  }

  async findById(id: number) {
    const row = this.rows.get(id)
    return row ? new MemberEntity(row) : null
  }

  async findByIdForUpdate(id: number) {
    // No-op by design: a single process has no concurrent transactions to
    // serialize, so there is nothing to lock. This must stay a no-op only
    // here — the drizzle twin takes a real row lock instead.
    return this.findById(id)
  }

  async create(entity: MemberEntity) {
    if ([...this.rows.values()].some((row) => row.phone === entity.phone)) throw duplicate()
    const stored: MemberEntityProps = { ...propsOf(entity), id: this.nextId++ }
    this.rows.set(stored.id, stored)
    return new MemberEntity(stored)
  }

  async update(entity: MemberEntity) {
    const stored = this.rows.get(entity.id)
    if (!stored) throw new DomainNotFoundError('ไม่พบสมาชิก', 'MEMBER_NOT_FOUND')
    if ([...this.rows.values()].some((row) => row.id !== entity.id && row.phone === entity.phone)) throw duplicate()
    // createdAt never changes, like the drizzle twin's SET clause.
    const next: MemberEntityProps = { ...propsOf(entity), id: stored.id, createdAt: stored.createdAt }
    this.rows.set(next.id, next)
    return new MemberEntity(next)
  }
}
