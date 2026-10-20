import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { buildShiftSummary } from '../../../../domains/shift-summary'
import { TOKENS } from '../../../tokens'
import type { IClock } from '../../../shared/ports/clock.port'
import type { ICheckoutPolicy } from '../../../shared/ports/checkout-policy.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { CommandIdempotency } from '../../../shared/applications/command-idempotency'
import { shiftRepositoryToken } from '../ports/shift.repository'
import type { IShiftRepository } from '../ports/shift.repository'
import { qrShiftReadinessToken } from '../../../qr-payments/applications/ports/qr-shift-readiness.port'
import type { IQrShiftReadiness } from '../../../qr-payments/applications/ports/qr-shift-readiness.port'
import { shiftSalesTotalsToken } from '../../../sales/applications/ports/shift-sales-totals.port'
import type { IShiftSalesTotals } from '../../../sales/applications/ports/shift-sales-totals.port'
import { shiftSummaryRepositoryToken } from '../ports/shift-summary.repository'
import type { IShiftSummaryRepository } from '../ports/shift-summary.repository'
import { startClosingSchema } from '../schemas/shift-schemas'
import { restoreShiftSnapshot } from '../shift-snapshot'
import type { ShiftActor } from '../shift-actor'

/** Command. */
@injectable()
export class StartShiftClosingUseCase {
  constructor(
    @inject(TOKENS.CheckoutPolicy) private readonly policy: ICheckoutPolicy,
    @inject(shiftRepositoryToken) private readonly shifts: IShiftRepository,
    @inject(TOKENS.UnitOfWork) private readonly uow: IUnitOfWork,
    @inject(TOKENS.Clock) private readonly clock: IClock,
    @inject(TOKENS.Idempotency) private readonly idempotency: CommandIdempotency,
    @inject(qrShiftReadinessToken) private readonly qrReadiness: IQrShiftReadiness,
    @inject(shiftSummaryRepositoryToken) private readonly summaries: IShiftSummaryRepository,
    @inject(shiftSalesTotalsToken) private readonly salesTotals: IShiftSalesTotals,
  ) {}
  async execute(id: number, input: unknown, actor: ShiftActor, branchId: number, idempotencyKey: string) {
    const dto = startClosingSchema.parse(input ?? {})
    if (!await this.policy.isShiftsEnabled()) throw new DomainConflictError('เริ่มนับกะได้เมื่อ CHECKOUT_MODE=shifts', 'CHECKOUT_MODE_REQUIRED')
    return this.uow.run(() => this.idempotency.execute(
      { actorId: actor.id, branchId, action: 'shifts.start-closing', key: idempotencyKey },
      { shiftId: id, ...dto },
      async () => {
      const shift = await this.shifts.findByIdForUpdate(id, branchId)
      if (!shift) throw new DomainNotFoundError('ไม่พบกะ', 'SHIFT_NOT_FOUND')
      // Read after the shift is locked: a QR request reserves under the same lock, so none can slip in.
      const qr = await this.qrReadiness.forShift(id)
      if (qr.unresolvedAttempts > 0)
        throw new DomainConflictError('มีการขอ QR ที่ยังไม่ทราบผล กรุณาตรวจสอบก่อนเริ่มนับ', 'QR_PAYMENT_UNRESOLVED', { count: qr.unresolvedAttempts })
      if (qr.paidUnclaimed > 0)
        throw new DomainConflictError('มีเงินจาก QR ที่จ่ายแล้วแต่ยังไม่มีบิล กรุณาจัดการก่อนเริ่มนับ', 'QR_PAYMENT_UNRESOLVED', { count: qr.paidUnclaimed })
      // Stopping the wait does not revoke a QR at the bank: whoever counts has to know money may still come.
      if (qr.pending.count > 0 && !dto.acknowledgePendingQr)
        throw new DomainConflictError('ยังมี QR ที่รอลูกค้าจ่าย กรุณายืนยันว่ารับทราบก่อนเริ่มนับ', 'QR_PENDING_ACKNOWLEDGEMENT_REQUIRED', { count: qr.pending.count, amountSatang: qr.pending.amountSatang })
      const expected = shift.expectedCashSatang(await this.shifts.cashDeltas(id))
      const now = this.clock.now()
      // Frozen with the shift locked: checkout takes the same lock, so every sale is either in it or refused.
      await this.summaries.freeze(
        id,
        buildShiftSummary(shift.openingCashSatang, await this.salesTotals.forShift(id), await this.summaries.cashTotals(id)),
        now,
      )
      return this.shifts.update(shift.startClosing(actor.id, actor.displayName, now, expected))
      },
      (shift) => shift.toSnapshot(),
      async (snapshot) => restoreShiftSnapshot(snapshot),
    ))
  }
}
