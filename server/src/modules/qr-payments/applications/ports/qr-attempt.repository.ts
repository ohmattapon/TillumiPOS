import type { Page } from '../../../../domains/page'
import type { NewQrAttempt, QrAttemptEntity } from '../../../../domains/qr-attempt.domain'

export interface IQrAttemptRepository {
  /** Reserves the reference in state `creating`. Throws IDEMPOTENCY_KEY_REUSED when the actor already used the key. */
  create(attempt: NewQrAttempt): Promise<QrAttemptEntity>
  findByKey(actorId: number, idempotencyKey: string): Promise<QrAttemptEntity | null>
  /** Row-locked until the surrounding unit of work ends. */
  findByIdForUpdate(id: number): Promise<QrAttemptEntity | null>
  save(attempt: QrAttemptEntity): Promise<QrAttemptEntity>
  /** Attempts of the branch whose outcome is not known yet, oldest first. */
  findUnresolved(query: { branchId: number; limit: number; offset: number }): Promise<Page<QrAttemptEntity>>
}

const token: unique symbol = Symbol('IQrAttemptRepository')
export const qrAttemptRepositoryToken = token.toString()
