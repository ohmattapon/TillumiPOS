import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { QrAttemptEntity, type NewQrAttempt, type QrAttemptEntityProps } from '../../../../domains/qr-attempt.domain'
import type { Page } from '../../../../domains/page'
import type { IClock } from '../../../shared/ports/clock.port'
import { TOKENS } from '../../../tokens'
import type { IQrAttemptRepository } from '../../applications/ports/qr-attempt.repository'

// Same code and message the API has always answered for a reused key.
const keyReused = () =>
  new DomainConflictError('Idempotency-Key นี้ถูกใช้กับข้อมูลคำขอชุดอื่นแล้ว', 'IDEMPOTENCY_KEY_REUSED')
const missing = () => new DomainNotFoundError('ไม่พบรายการขอ QR', 'QR_ATTEMPT_NOT_FOUND')

/**
 * No-database QR attempt store: one Map, ids assigned from 1 in creation
 * order. The (actor, idempotency key) pair stays unique, like the drizzle
 * twin's unique index, so a retried request never reserves twice.
 */
@injectable()
export class MemoryQrAttemptRepository implements IQrAttemptRepository {
  private readonly rows = new Map<number, QrAttemptEntityProps>()
  private nextId = 1

  constructor(@inject(TOKENS.Clock) private readonly clock: IClock) {}

  async create(attempt: NewQrAttempt) {
    if (
      [...this.rows.values()].some(
        (row) => row.actorId === attempt.actorId && row.idempotencyKey === attempt.idempotencyKey,
      )
    )
      throw keyReused()
    const stored: QrAttemptEntityProps = {
      ...attempt,
      id: this.nextId++,
      state: 'creating',
      qrPaymentId: null,
      qrImage: null,
      createdAt: this.clock.now(),
    }
    this.rows.set(stored.id, stored)
    return new QrAttemptEntity(stored)
  }

  async findByKey(actorId: number, idempotencyKey: string) {
    const row = [...this.rows.values()].find(
      (candidate) => candidate.actorId === actorId && candidate.idempotencyKey === idempotencyKey,
    )
    return row ? new QrAttemptEntity(row) : null
  }

  async findByIdForUpdate(id: number) {
    // No-op by design: a single process has no concurrent transactions to
    // serialize, so there is nothing to lock. This must stay a no-op only
    // here — the drizzle twin takes a real row lock instead.
    const row = this.rows.get(id)
    return row ? new QrAttemptEntity(row) : null
  }

  async save(attempt: QrAttemptEntity) {
    const stored = this.rows.get(attempt.id)
    if (!stored) throw missing()
    // Only the bank-answer fields move, like the drizzle twin's SET clause.
    this.rows.set(stored.id, {
      ...stored,
      state: attempt.state,
      qrPaymentId: attempt.qrPaymentId,
      qrImage: attempt.qrImage,
    })
    return new QrAttemptEntity(this.rows.get(stored.id)!)
  }

  async findUnresolved(query: { branchId: number; limit: number; offset: number }): Promise<Page<QrAttemptEntity>> {
    const matching = [...this.rows.values()]
      .filter(
        (row) =>
          row.branchId === query.branchId && (row.state === 'creating' || row.state === 'unknown'),
      )
      .sort((a, b) => a.id - b.id)
    return {
      items: matching.slice(query.offset, query.offset + query.limit).map((row) => new QrAttemptEntity(row)),
      total: matching.length,
    }
  }

  /**
   * Every attempt of the shift that asked the bank, oldest first. Not part
   * of the port: the qr-shift-readiness twin in this module reads through
   * here; the port's unresolved query is branch-scoped.
   */
  async findByShift(shiftId: number): Promise<QrAttemptEntity[]> {
    return [...this.rows.values()]
      .filter((row) => row.originShiftId === shiftId)
      .sort((a, b) => a.id - b.id)
      .map((row) => new QrAttemptEntity(row))
  }
}
