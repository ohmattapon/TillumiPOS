import type { MemberEntity } from '../../../../domains/member.domain'

/** The member a quote is priced for. Owned here, answered by the members module. */
export interface IQuoteMembers {
  findById(id: number): Promise<MemberEntity | null>
}

const quoteMembersTokenSymbol: unique symbol = Symbol('IQuoteMembers')
export const quoteMembersToken = quoteMembersTokenSymbol.toString()
