import type { MemberEntity } from '../../../../domains/member.domain'

/** The member a bill is sold to. Owned here, answered by the members module. */
export interface ICheckoutMembers {
  findByIdForUpdate(id: number): Promise<MemberEntity | null>
}

const checkoutMembersTokenSymbol: unique symbol = Symbol('ICheckoutMembers')
export const checkoutMembersToken = checkoutMembersTokenSymbol.toString()
