import { injectable } from 'tsyringe'
import { DomainError } from '../../../../domains/errors/domain-error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { MAX_AMOUNT_SATANG } from '../../../../domains/sale.domain'
import {
  ShiftCashEntryEntity,
  type ShiftCashEntryProps,
} from '../../../../domains/shift-cash-entry.domain'
import { ShiftEntity, type ShiftProps } from '../../../../domains/shift.domain'
import type { Page } from '../../../../domains/page'
import type { IShiftRepository, ShiftListQuery } from '../../applications/ports/shift.repository'

const missing = () => new DomainNotFoundError('ไม่พบกะ', 'SHIFT_NOT_FOUND')
const tooLarge = () =>
  new DomainError('ยอดเงินสดรวมของกะเกินขอบเขตที่ระบบรองรับ กรุณาปิดกะและเปิดกะใหม่', 'AMOUNT_TOO_LARGE')

const signedOf = (entry: Pick<ShiftCashEntryProps, 'kind' | 'amountSatang'>) =>
  entry.kind === 'cash_sale' || entry.kind === 'cash_in' ? entry.amountSatang : -entry.amountSatang

const isActive = (status: ShiftProps['status']) => status === 'open' || status === 'closing'

/**
 * No-database shift store: one Map for shifts plus one for drawer entries,
 * ids assigned from 1 in creation order. Timestamps come from the entities
 * the use cases built with the clock; this repo stamps nothing itself.
 */
@injectable()
export class MemoryShiftRepository implements IShiftRepository {
  private readonly rows = new Map<number, ShiftProps>()
  private readonly entries = new Map<number, ShiftCashEntryProps>()
  private nextId = 1
  private nextEntryId = 1

  async create(shift: ShiftEntity) {
    const stored: ShiftProps = { ...shift.toSnapshot(), id: this.nextId++ }
    this.rows.set(stored.id, stored)
    return new ShiftEntity(stored)
  }

  async findById(id: number, branchId: number) {
    const row = this.rows.get(id)
    return row && row.branchId === branchId ? new ShiftEntity(row) : null
  }

  async findByIdForUpdate(id: number, branchId: number) {
    // No-op by design: a single process has no concurrent transactions to
    // serialize, so there is nothing to lock. This must stay a no-op only
    // here — the drizzle twin takes a real row lock instead.
    return this.findById(id, branchId)
  }

  async findCurrentByRegister(registerId: number, branchId: number) {
    const row = [...this.rows.values()]
      .filter((candidate) => candidate.registerId === registerId && candidate.branchId === branchId && isActive(candidate.status))
      .sort((a, b) => a.id - b.id)[0]
    return row ? new ShiftEntity(row) : null
  }

  async list(query: ShiftListQuery): Promise<Page<ShiftEntity>> {
    const matching = [...this.rows.values()].filter(
      (row) =>
        row.branchId === query.branchId &&
        (query.registerId === undefined || row.registerId === query.registerId) &&
        (query.status === undefined || row.status === query.status) &&
        (query.from === undefined || row.openedAt >= query.from) &&
        (query.to === undefined || row.openedAt <= query.to),
    )
    const ordered = matching.sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime() || b.id - a.id)
    return {
      items: ordered.slice(query.offset, query.offset + query.limit).map((row) => new ShiftEntity(row)),
      total: matching.length,
    }
  }

  async update(shift: ShiftEntity) {
    if (!this.rows.has(shift.id)) throw missing()
    const next: ShiftProps = { ...shift.toSnapshot(), id: shift.id }
    this.rows.set(next.id, next)
    return new ShiftEntity(next)
  }

  async cashDeltas(shiftId: number) {
    let total = 0n
    for (const entry of this.entries.values())
      if (entry.shiftId === shiftId) total += BigInt(signedOf(entry))
    if (total > BigInt(MAX_AMOUNT_SATANG) || total < BigInt(-MAX_AMOUNT_SATANG)) throw tooLarge()
    return total === 0n ? [] : [{ amountSatang: Number(total) }]
  }

  async addCashEntry(entry: ShiftCashEntryEntity) {
    const stored: ShiftCashEntryProps = { ...entry.toSnapshot(), id: this.nextEntryId++ }
    this.entries.set(stored.id, stored)
    return new ShiftCashEntryEntity(stored)
  }

  async listCashEntries(shiftId: number, limit: number, offset: number): Promise<Page<ShiftCashEntryEntity>> {
    const matching = [...this.entries.values()]
      .filter((entry) => entry.shiftId === shiftId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id)
    return {
      items: matching.slice(offset, offset + limit).map((entry) => new ShiftCashEntryEntity(entry)),
      total: matching.length,
    }
  }

  /**
   * Whether any drawer is open or being counted, across branches. Not part
   * of the port: the shift-settings-guard twin in this module reads through
   * here; the port's list is branch-scoped.
   */
  async hasOpenOrClosing(): Promise<boolean> {
    return [...this.rows.values()].some((row) => isActive(row.status))
  }
}
