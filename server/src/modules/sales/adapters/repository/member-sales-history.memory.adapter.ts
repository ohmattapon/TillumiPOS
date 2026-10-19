import { injectable } from 'tsyringe'
import type {
  IMemberSalesHistory,
  MemberHistoryPage,
  MemberHistoryQuery,
  MemberSaleHeader,
} from '../../../members/applications/ports/member-sales-history.port'
import { MemorySaleRepository } from './sale.memory.repository'

// Shop-calendar day of a moment, like the drizzle twin's date-in-timezone
// bounds. en-CA formats as YYYY-MM-DD, so string comparison orders days.
const dayOf = (at: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)

/**
 * Answers the members module's question from the sales' own memory store. The
 * demo composition root must hand this the same MemorySaleRepository
 * singleton the sale token gets.
 */
@injectable()
export class MemoryMemberSalesHistory implements IMemberSalesHistory {
  constructor(private readonly sales: MemorySaleRepository) {}

  async find(query: MemberHistoryQuery): Promise<MemberHistoryPage> {
    const matching = (await this.sales.findByMember(query.memberId, query.branchId)).filter(
      (sale) =>
        (query.status === undefined || sale.status === query.status) &&
        (query.from === undefined || dayOf(sale.createdAt, query.timeZone) >= query.from) &&
        (query.to === undefined || dayOf(sale.createdAt, query.timeZone) <= query.to),
    )
    const items: MemberSaleHeader[] = matching
      .slice(query.offset, query.offset + query.limit)
      .map((sale) => ({
        id: sale.id,
        receiptNo: sale.receiptNo,
        branchId: sale.branchId,
        cashierName: sale.cashierName,
        status: sale.status,
        totalSatang: sale.totalSatang,
        createdAt: sale.createdAt,
      }))
    const completed = matching.filter((sale) => sale.status === 'completed')
    return {
      items,
      total: matching.length,
      summary: {
        saleCount: completed.length,
        totalSatang: completed.reduce((total, sale) => total + sale.totalSatang, 0),
      },
    }
  }
}
