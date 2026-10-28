import { and, count, eq, ilike, or, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { MemberEntity } from '../../../../domains/member.domain'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { members } from '../../../../infrastructure/database/schema/members'
import { isUniqueViolation } from '../../../../libs/pg-error'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IMemberRepository, MemberListQuery } from '../../applications/ports/member.repository'

const duplicate = () => new DomainConflictError('เบอร์โทรนี้มีสมาชิกอยู่แล้ว กรุณาใช้สมาชิกเดิม', 'DUPLICATE_MEMBER_PHONE')

@injectable()
export class DrizzleMemberRepository implements IMemberRepository {
  async find(query: MemberListQuery) {
    const pattern = query.search ? `%${query.search.replace(/[\\%_]/g, '\\$&')}%` : undefined
    const code = sql<string>`concat('M', lpad(${members.id}::text, greatest(6, length(${members.id}::text)), '0'))`
    const where = and(
      query.isActive === undefined ? undefined : eq(members.isActive, query.isActive),
      pattern ? or(ilike(members.name, pattern), ilike(members.phone, pattern), ilike(code, pattern)) : undefined,
    )
    const rows = await currentExecutor().select().from(members).where(where).orderBy(members.name, members.id).limit(query.limit).offset(query.offset)
    const [total] = await currentExecutor().select({ value: count() }).from(members).where(where)
    return { items: rows.map((row) => new MemberEntity(row)), total: total!.value }
  }

  async findById(id: number) {
    const [row] = await currentExecutor().select().from(members).where(eq(members.id, id))
    return row ? new MemberEntity(row) : null
  }

  async findByIdForUpdate(id: number) {
    const [row] = await currentExecutor().select().from(members).where(eq(members.id, id)).for('update')
    return row ? new MemberEntity(row) : null
  }

  async create(entity: MemberEntity) {
    // `pointsBalance` stays out: only the points ledger moves a member's balance.
    const { id: _id, code: _code, pointsBalance: _pointsBalance, ...values } = entity.toSnapshot()
    try {
      const [row] = await currentExecutor().insert(members).values(values).returning()
      return new MemberEntity(row!)
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate()
      throw error
    }
  }

  async update(entity: MemberEntity) {
    // `pointsBalance` stays out: only the points ledger moves a member's balance.
    const { id, code: _code, createdAt: _createdAt, pointsBalance: _pointsBalance, ...values } = entity.toSnapshot()
    try {
      const [row] = await currentExecutor().update(members).set(values).where(eq(members.id, id)).returning()
      if (!row) throw new DomainNotFoundError('ไม่พบสมาชิก', 'MEMBER_NOT_FOUND')
      return new MemberEntity(row)
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate()
      throw error
    }
  }
}
