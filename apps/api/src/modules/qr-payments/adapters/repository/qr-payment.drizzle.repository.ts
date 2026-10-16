import { and, count, eq, isNull } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { QrPaymentEntity, type NewQrPayment } from '../../../../domains/qr-payment.domain'
import { qrPayments } from '../../../../infrastructure/database/schema/qr-payments'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IQrPaymentRepository } from '../../applications/ports/qr-payment.repository'

const columns = {
  id: qrPayments.id,
  branchId: qrPayments.branchId,
  reference: qrPayments.reference,
  amountSatang: qrPayments.amountSatang,
  status: qrPayments.status,
  qrRawData: qrPayments.qrRawData,
  expiresAt: qrPayments.expiresAt,
  bankTransactionId: qrPayments.bankTransactionId,
  payerName: qrPayments.payerName,
  paidAt: qrPayments.paidAt,
  lastCheckedAt: qrPayments.lastCheckedAt,
  saleId: qrPayments.saleId,
  originShiftId: qrPayments.originShiftId,
  dismissedAt: qrPayments.dismissedAt,
  dismissedById: qrPayments.dismissedById,
  dismissReason: qrPayments.dismissReason,
  createdById: qrPayments.createdById,
  createdAt: qrPayments.createdAt,
}

@injectable()
export class DrizzleQrPaymentRepository implements IQrPaymentRepository {
  async create(payment: NewQrPayment) {
    const [row] = await currentExecutor().insert(qrPayments).values(payment).returning(columns)
    return new QrPaymentEntity(row!)
  }

  async findById(id: number) {
    const [row] = await currentExecutor().select(columns).from(qrPayments).where(eq(qrPayments.id, id))
    return row ? new QrPaymentEntity(row) : null
  }

  async findByIdForUpdate(id: number) {
    const [row] = await currentExecutor().select(columns).from(qrPayments).where(eq(qrPayments.id, id)).for('update')
    return row ? new QrPaymentEntity(row) : null
  }

  async findByReference(reference: string) {
    const [row] = await currentExecutor().select(columns).from(qrPayments).where(eq(qrPayments.reference, reference))
    return row ? new QrPaymentEntity(row) : null
  }

  async findByReferenceForUpdate(reference: string) {
    const [row] = await currentExecutor()
      .select(columns)
      .from(qrPayments)
      .where(eq(qrPayments.reference, reference))
      .for('update')
    return row ? new QrPaymentEntity(row) : null
  }

  async findUnclaimed({ branchId, limit, offset, amountSatang }: { branchId: number; limit: number; offset: number; amountSatang?: number }) {
    const matching = and(
      eq(qrPayments.branchId, branchId),
      eq(qrPayments.status, 'paid'),
      isNull(qrPayments.saleId),
      isNull(qrPayments.dismissedAt),
      amountSatang !== undefined ? eq(qrPayments.amountSatang, amountSatang) : undefined,
    )
    const rows = await currentExecutor()
      .select(columns)
      .from(qrPayments)
      .where(matching)
      .orderBy(qrPayments.paidAt, qrPayments.id)
      .limit(limit)
      .offset(offset)
    const [counted] = await currentExecutor().select({ total: count() }).from(qrPayments).where(matching)
    return { items: rows.map((row) => new QrPaymentEntity(row)), total: counted!.total }
  }

  async save(payment: QrPaymentEntity) {
    const { id, status, bankTransactionId, payerName, paidAt, lastCheckedAt, saleId, dismissedAt, dismissedById, dismissReason } =
      payment.toSnapshot()
    const [row] = await currentExecutor()
      .update(qrPayments)
      .set({
        status,
        bankTransactionId,
        payerName,
        paidAt,
        lastCheckedAt,
        saleId,
        dismissedAt,
        dismissedById,
        dismissReason,
        updatedAt: new Date(),
      })
      .where(eq(qrPayments.id, id))
      .returning(columns)
    if (!row) throw new DomainNotFoundError('ไม่พบรายการชำระด้วย QR', 'QR_PAYMENT_NOT_FOUND')
    return new QrPaymentEntity(row)
  }
}
