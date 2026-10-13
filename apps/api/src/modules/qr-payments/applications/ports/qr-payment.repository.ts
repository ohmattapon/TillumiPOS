import type { Page } from '../../../../domains/page'
import type { NewQrPayment, QrPaymentEntity } from '../../../../domains/qr-payment.domain'

export interface IQrPaymentRepository {
  create(payment: NewQrPayment): Promise<QrPaymentEntity>
  findById(id: number): Promise<QrPaymentEntity | null>
  /** Like findById, but row-locks the payment until the surrounding unit of work ends. */
  findByIdForUpdate(id: number): Promise<QrPaymentEntity | null>
  /** Row-locked, by the reference the bank reports back. */
  findByReferenceForUpdate(reference: string): Promise<QrPaymentEntity | null>
  /** Payments of the branch the bank confirmed that have no sale and were not dismissed, oldest first. */
  findUnclaimed(query: { branchId: number; limit: number; offset: number }): Promise<Page<QrPaymentEntity>>
  /** Writes the status, bank details, last check, sale and dismissal of an existing payment. */
  save(payment: QrPaymentEntity): Promise<QrPaymentEntity>
}

const qrPaymentRepositoryTokenSymbol: unique symbol = Symbol('IQrPaymentRepository')
export const qrPaymentRepositoryToken = qrPaymentRepositoryTokenSymbol.toString()
