export interface MemberHistoryQuery {
  memberId: number
  branchId: number
  from?: string
  to?: string
  timeZone: string
  status?: 'completed' | 'voided'
  limit: number
  offset: number
}
export interface MemberSaleHeader {
  id: number
  receiptNo: string
  branchId: number
  cashierName: string
  status: 'completed' | 'voided'
  totalSatang: number
  createdAt: Date
}
export interface MemberHistoryPage {
  items: MemberSaleHeader[]
  total: number
  summary: { saleCount: number; totalSatang: number }
}
export interface IMemberSalesHistory { find(query: MemberHistoryQuery): Promise<MemberHistoryPage> }
export const memberSalesHistoryToken = Symbol('IMemberSalesHistory').toString()
