import { inject, injectable } from 'tsyringe'
import { SaleEntity, type NewSale, type PaymentMethod, type SaleEntityProps } from '../../../../domains/sale.domain'
import { shopSettingsRepositoryToken } from '../../../settings/applications/ports/shop-settings.repository'
import type { IShopSettingsRepository } from '../../../settings/applications/ports/shop-settings.repository'
import type { IClock } from '../../../shared/ports/clock.port'
import { TOKENS } from '../../../tokens'
import type { IFindSalesQuery, ISaleHeader, ISaleRepository, ISalesTotals } from '../../applications/ports/sale.repository'

const METHOD_ORDER: PaymentMethod[] = ['card', 'cash', 'promptpay']

// Shop-calendar day of a moment, like the drizzle twin's
// `(now() at time zone $tz)::date`. en-CA formats as YYYY-MM-DD.
const dayOf = (at: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)

/**
 * No-database sale store: one Map for headers plus Maps for lines and
 * payments, ids assigned from 1 in creation order. A sale is never edited:
 * voiding only flips the status fields, like the drizzle twin's saveVoid.
 */
@injectable()
export class MemorySaleRepository implements ISaleRepository {
  private readonly rows = new Map<number, SaleEntityProps>()
  private readonly counters = new Map<string, number>()
  private nextId = 1

  constructor(
    @inject(shopSettingsRepositoryToken) private readonly settings: IShopSettingsRepository,
    @inject(TOKENS.Clock) private readonly clock: IClock,
  ) {}

  async nextReceiptNo(branch: { id: number; code: string }) {
    // One counter per branch and business day, like the drizzle twin's
    // receipt_counters row. A failed sale after this call leaves a gap:
    // memory has no rollback, so demo numbers can skip where drizzle would not.
    const { timeZone } = await this.settings.get()
    const day = dayOf(this.clock.now(), timeZone).replaceAll('-', '')
    const key = `${branch.id}:${day}`
    const lastNumber = (this.counters.get(key) ?? 0) + 1
    this.counters.set(key, lastNumber)
    return [branch.code, day, String(lastNumber).padStart(5, '0')].join('-')
  }

  async create(sale: NewSale, receiptNo: string) {
    const stored: SaleEntityProps = {
      ...sale,
      member: sale.member ?? null,
      promotion: sale.promotion ?? null,
      id: this.nextId++,
      receiptNo,
      status: 'completed',
      voidedById: null,
      voidedAt: null,
      voidReason: null,
      createdAt: this.clock.now(),
      items: sale.items.map((item) => ({ ...item, options: [...item.options] })),
      payments: sale.payments.map((payment) => ({ ...payment })),
    }
    this.rows.set(stored.id, stored)
    return new SaleEntity(stored)
  }

  async findById(id: number) {
    const row = this.rows.get(id)
    return row ? new SaleEntity(row) : null
  }

  async findByIdForUpdate(id: number) {
    // No-op by design: a single process has no concurrent transactions to
    // serialize, so there is nothing to lock. This must stay a no-op only
    // here — the drizzle twin takes a real row lock instead.
    return this.findById(id)
  }

  async saveVoid(sale: SaleEntity) {
    const stored = this.rows.get(sale.id)
    // Only reachable if the row vanished between the use case's read and this write.
    if (!stored) return
    // Only the void fields move, like the drizzle twin's SET clause.
    this.rows.set(stored.id, {
      ...stored,
      status: sale.status,
      voidedById: sale.voidedById,
      voidedAt: sale.voidedAt,
      voidReason: sale.voidReason,
    })
  }

  async findHeaders(query: IFindSalesQuery): Promise<{ items: ISaleHeader[]; total: number }> {
    const matching = [...this.rows.values()].filter(
      (row) =>
        row.branchId === query.branchId &&
        (query.status === undefined || row.status === query.status) &&
        (query.from === undefined || row.createdAt >= query.from) &&
        (query.to === undefined || row.createdAt < query.to),
    )
    const ordered = matching.sort((a, b) => b.id - a.id)
    const items: ISaleHeader[] = ordered
      .slice(query.offset ?? 0, (query.offset ?? 0) + (query.limit ?? 100))
      .map(({ items: _items, payments: _payments, voidedById: _voided, promotion, ...header }) => ({
        ...header,
        member: header.member ?? null,
        promotion: promotion ?? null,
      }))
    return { items, total: matching.length }
  }

  async sumCompleted(period: { from: Date; to: Date; branchId: number }): Promise<ISalesTotals> {
    const completed = [...this.rows.values()].filter(
      (row) =>
        row.branchId === period.branchId &&
        row.status === 'completed' &&
        row.createdAt >= period.from &&
        row.createdAt < period.to,
    )
    const tendered = new Map<PaymentMethod, number>()
    for (const row of completed)
      for (const payment of row.payments)
        tendered.set(payment.method, (tendered.get(payment.method) ?? 0) + payment.amountSatang)
    return {
      saleCount: completed.length,
      totalSatang: completed.reduce((total, row) => total + row.totalSatang, 0),
      vatSatang: completed.reduce((total, row) => total + row.vatSatang, 0),
      discountSatang: completed.reduce((total, row) => total + row.discountSatang, 0),
      changeSatang: completed.reduce((total, row) => total + row.changeSatang, 0),
      costSatang: completed.reduce(
        (total, row) => total + row.items.reduce((lines, item) => lines + item.unitCostSatang * item.quantity, 0),
        0,
      ),
      // Alphabetical by method, like the drizzle twin's `order by payments.method`.
      tendered: METHOD_ORDER.filter((method) => tendered.has(method)).map((method) => ({
        method,
        amountSatang: tendered.get(method)!,
      })),
    }
  }

  /**
   * Every sale recorded in the shift, voided or not, oldest first. Not part
   * of the port: the shift-sales-totals twin in this module reads through
   * here so sales never grows a shift-scoped query for one consumer.
   */
  async findByShift(shiftId: number): Promise<SaleEntity[]> {
    return [...this.rows.values()]
      .filter((row) => row.shiftId === shiftId)
      .sort((a, b) => a.id - b.id)
      .map((row) => new SaleEntity(row))
  }

  /**
   * A member's sales in the branch, newest first. Not part of the port: the
   * member-sales-history twin in this module reads through here; day and
   * status filtering stay with that consumer.
   */
  async findByMember(memberId: number, branchId: number): Promise<SaleEntity[]> {
    return [...this.rows.values()]
      .filter((row) => row.branchId === branchId && row.member?.id === memberId)
      .sort((a, b) => b.id - a.id)
      .map((row) => new SaleEntity(row))
  }

  /**
   * Every sale created in [fromMs, toMs), every branch when branchId is null,
   * oldest first. Not part of the port: the sales-report twin in this module
   * reads through here so sales never grows a report-scoped query for one
   * consumer. Bounds are epoch milliseconds, like the drizzle twin's SQL
   * bounds, so the twin stays free of date construction.
   */
  async findForReport(period: { fromMs: number; toMs: number; branchId: number | null }): Promise<SaleEntity[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          (period.branchId === null || row.branchId === period.branchId) &&
          row.createdAt.getTime() >= period.fromMs &&
          row.createdAt.getTime() < period.toMs,
      )
      .sort((a, b) => a.id - b.id)
      .map((row) => new SaleEntity(row))
  }
}
