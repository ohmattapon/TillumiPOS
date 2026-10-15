import type { MemberEntity } from '../../../../domains/member.domain'
import type { Page } from '../../../../domains/page'

export interface MemberListQuery { search?: string; isActive?: boolean; limit: number; offset: number }
export interface IMemberRepository {
  find(query: MemberListQuery): Promise<Page<MemberEntity>>
  findById(id: number): Promise<MemberEntity | null>
  findByIdForUpdate(id: number): Promise<MemberEntity | null>
  create(entity: MemberEntity): Promise<MemberEntity>
  update(entity: MemberEntity): Promise<MemberEntity>
}
export const memberRepositoryToken = Symbol('IMemberRepository').toString()
