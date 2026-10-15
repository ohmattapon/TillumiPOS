import { and, count, eq, inArray } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { QrAttemptEntity, type NewQrAttempt } from '../../../../domains/qr-attempt.domain'
import { shiftQrAttempts } from '../../../../infrastructure/database/schema/shift-qr-attempts'
import { isUniqueViolation } from '../../../../libs/pg-error'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IQrAttemptRepository } from '../../applications/ports/qr-attempt.repository'

const columns = {
  id: shiftQrAttempts.id,
  originShiftId: shiftQrAttempts.originShiftId,
  branchId: shiftQrAttempts.branchId,
  reference: shiftQrAttempts.reference,
  amountSatang: shiftQrAttempts.amountSatang,
  state: shiftQrAttempts.state,
  qrPaymentId: shiftQrAttempts.qrPaymentId,
  qrImage: shiftQrAttempts.qrImage,
  actorId: shiftQrAttempts.actorId,
  actorName: shiftQrAttempts.actorName,
  idempotencyKey: shiftQrAttempts.idempotencyKey,
  createdAt: shiftQrAttempts.createdAt,
}

@injectable()
export class DrizzleQrAttemptRepository implements IQrAttemptRepository {
  async create(attempt: NewQrAttempt) {
    try {
      const [row] = await currentExecutor().insert(shiftQrAttempts).values(attempt).returning(columns)
      return new QrAttemptEntity(row!)
    } catch (error) {
      if (isUniqueViolation(error))
        throw new DomainConflictError('Idempotency-Key นี้ถูกใช้กับข้อมูลคำขอชุดอื่นแล้ว', 'IDEMPOTENCY_KEY_REUSED')
      throw error
    }
  }

  async findByKey(actorId: number, idempotencyKey: string) {
    const [row] = await currentExecutor()
      .select(columns)
      .from(shiftQrAttempts)
      .where(and(eq(shiftQrAttempts.actorId, actorId), eq(shiftQrAttempts.idempotencyKey, idempotencyKey)))
    return row ? new QrAttemptEntity(row) : null
  }

  async findByIdForUpdate(id: number) {
    const [row] = await currentExecutor().select(columns).from(shiftQrAttempts).where(eq(shiftQrAttempts.id, id)).for('update')
    return row ? new QrAttemptEntity(row) : null
  }

  async save(attempt: QrAttemptEntity) {
    const { id, state, qrPaymentId, qrImage } = attempt.toSnapshot()
    const [row] = await currentExecutor()
      .update(shiftQrAttempts)
      .set({ state, qrPaymentId, qrImage, updatedAt: new Date() })
      .where(eq(shiftQrAttempts.id, id))
      .returning(columns)
    if (!row) throw new DomainNotFoundError('ไม่พบรายการขอ QR', 'QR_ATTEMPT_NOT_FOUND')
    return new QrAttemptEntity(row)
  }

  async findUnresolved({ branchId, limit, offset }: { branchId: number; limit: number; offset: number }) {
    const matching = and(
      eq(shiftQrAttempts.branchId, branchId),
      inArray(shiftQrAttempts.state, ['creating', 'unknown']),
    )
    const rows = await currentExecutor()
      .select(columns)
      .from(shiftQrAttempts)
      .where(matching)
      .orderBy(shiftQrAttempts.id)
      .limit(limit)
      .offset(offset)
    const [counted] = await currentExecutor().select({ total: count() }).from(shiftQrAttempts).where(matching)
    return { items: rows.map((row) => new QrAttemptEntity(row)), total: counted!.total }
  }
}
