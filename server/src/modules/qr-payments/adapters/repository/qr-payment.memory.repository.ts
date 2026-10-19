import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { QrPaymentEntity, type NewQrPayment, type QrPaymentEntityProps } from '../../../../domains/qr-payment.domain'
import type { IClock } from '../../../shared/ports/clock.port'
import { TOKENS } from '../../../tokens'
import type { IQrPaymentRepository } from '../../applications/ports/qr-payment.repository'

const missing = () => new DomainNotFoundError('ไม่พบรายการชำระด้วย QR', 'QR_PAYMENT_NOT_FOUND')

/**
 * No-database QR payment store: one Map, ids assigned from 1 in creation
 * order. Money rules stay in the entity: a paid payment keeps waiting for
 * its sale until it is used or dismissed, exactly like the drizzle twin.
 */
@injectable()
export class MemoryQrPaymentRepository implements IQrPaymentRepository {
  private readonly rows = new Map<number, QrPaymentEntityProps>()
  private nextId = 1

  constructor(@inject(TOKENS.Clock) private readonly clock: IClock) {}

  async create(payment: NewQrPayment) {
    const stored: QrPaymentEntityProps = {
      ...payment,
      id: this.nextId++,
      status: 'pending',
      bankTransactionId: null,
      payerName: null,
      paidAt: null,
      lastCheckedAt: null,
      saleId: null,
      dismissedAt: null,
      dismissedById: null,
      dismissReason: null,
      createdAt: this.clock.now(),
    }
    this.rows.set(stored.id, stored)
    return new QrPaymentEntity(stored)
  }

  async findById(id: number) {
    const row = this.rows.get(id)
    return row ? new QrPaymentEntity(row) : null
  }

  async findByIdForUpdate(id: number) {
    // No-op by design: a single process has no concurrent transactions to
    // serialize, so there is nothing to lock. This must stay a no-op only
    // here — the drizzle twin takes a real row lock instead.
    return this.findById(id)
  }

  async findByReference(reference: string) {
    const row = [...this.rows.values()].find((candidate) => candidate.reference === reference)
    return row ? new QrPaymentEntity(row) : null
  }

  async findByReferenceForUpdate(reference: string) {
    // No-op by design, like findByIdForUpdate above.
    return this.findByReference(reference)
  }

  async findUnclaimed(query: { branchId: number; limit: number; offset: number; amountSatang?: number }) {
    const matching = [...this.rows.values()]
      .filter(
        (row) =>
          row.branchId === query.branchId &&
          row.status === 'paid' &&
          row.saleId === null &&
          row.dismissedAt === null &&
          (query.amountSatang === undefined || row.amountSatang === query.amountSatang),
      )
      .sort((a, b) => a.paidAt!.getTime() - b.paidAt!.getTime() || a.id - b.id)
    return {
      items: matching.slice(query.offset, query.offset + query.limit).map((row) => new QrPaymentEntity(row)),
      total: matching.length,
    }
  }

  async save(payment: QrPaymentEntity) {
    const stored = this.rows.get(payment.id)
    if (!stored) throw missing()
    // Only the bank-answer, sale and dismissal fields move, like the drizzle
    // twin's SET clause.
    const snapshot = payment.toSnapshot()
    this.rows.set(stored.id, {
      ...stored,
      status: snapshot.status,
      bankTransactionId: snapshot.bankTransactionId,
      payerName: snapshot.payerName,
      paidAt: snapshot.paidAt,
      lastCheckedAt: snapshot.lastCheckedAt,
      saleId: snapshot.saleId,
      dismissedAt: snapshot.dismissedAt,
      dismissedById: snapshot.dismissedById,
      dismissReason: snapshot.dismissReason,
    })
    return new QrPaymentEntity(this.rows.get(stored.id)!)
  }

  /**
   * Every payment of the shift that asked the bank, oldest first. Not part
   * of the port: the qr-shift-readiness twin in this module reads through
   * here so qr-payments never grows a shift-scoped query for one consumer.
   */
  async findByShift(shiftId: number): Promise<QrPaymentEntity[]> {
    return [...this.rows.values()]
      .filter((row) => row.originShiftId === shiftId)
      .sort((a, b) => a.id - b.id)
      .map((row) => new QrPaymentEntity(row))
  }
}
