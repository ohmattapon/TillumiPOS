import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { auditLogToken, type IAuditLog } from '../../../audit/applications/ports/audit-log.port'
import { canDo } from '../../../../domains/authorization'
import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { ShiftEntity } from '../../../../domains/shift.domain'
import { TOKENS } from '../../../tokens'
import type { IClock } from '../../../shared/ports/clock.port'
import type { ICheckoutPolicy } from '../../../shared/ports/checkout-policy.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { CommandIdempotency } from '../../../shared/applications/command-idempotency'
import { shiftRepositoryToken } from '../ports/shift.repository'
import type { IShiftRepository } from '../ports/shift.repository'
import { qrShiftReadinessToken } from '../../../qr-payments/applications/ports/qr-shift-readiness.port'
import type { IQrShiftReadiness } from '../../../qr-payments/applications/ports/qr-shift-readiness.port'
import { closeShiftSchema } from '../schemas/shift-schemas'
import { restoreShiftSnapshot } from '../shift-snapshot'
import type { ShiftActor } from '../shift-actor'

/** Command. */
@injectable()
export class CloseShiftUseCase {
  constructor(
    @inject(TOKENS.CheckoutPolicy) private readonly policy: ICheckoutPolicy,
    @inject(shiftRepositoryToken) private readonly shifts: IShiftRepository,
    @inject(TOKENS.UnitOfWork) private readonly uow: IUnitOfWork,
    @inject(TOKENS.Clock) private readonly clock: IClock,
    @inject(TOKENS.Idempotency) private readonly idempotency: CommandIdempotency,
    @inject(qrShiftReadinessToken) private readonly qrReadiness: IQrShiftReadiness,
    @inject(auditLogToken) private readonly audit: IAuditLog,
  ) { }
  async execute(id: number, input: unknown, actor: ShiftActor, branchId: number, idempotencyKey: string) {
    const dto = closeShiftSchema.parse(input)
    if (!await this.policy.isShiftsEnabled()) throw new DomainConflictError('ปิดกะได้เมื่อ CHECKOUT_MODE=shifts', 'CHECKOUT_MODE_REQUIRED')
    return this.uow.run(() => this.idempotency.execute(
      { actorId: actor.id, branchId, action: 'shifts.close', key: idempotencyKey },
      dto,
      () => this.close(id, dto, actor, branchId),
      (shift) => shift.toSnapshot(),
      async (snapshot) => restoreShiftSnapshot(snapshot),
    ))
  }

  private async close(id: number, dto: ReturnType<typeof closeShiftSchema.parse>, actor: ShiftActor, branchId: number): Promise<ShiftEntity> {
    const shift = await this.shifts.findByIdForUpdate(id, branchId)
    if (!shift) throw new DomainNotFoundError('ไม่พบกะ', 'SHIFT_NOT_FOUND')
    if (!canDo(actor, 'shifts.override') && actor.id !== shift.closingStartedById)
      throw new DomainConflictError('เฉพาะผู้เริ่มนับหรือเจ้าของร้านยืนยันปิดกะได้', 'SHIFT_CLOSING_OWNER_REQUIRED')
    // The bank may have confirmed a payment while the drawer was being counted.
    if ((await this.qrReadiness.forShift(id)).paidUnclaimed > 0)
      throw new DomainConflictError('มีเงินจาก QR เข้ามาระหว่างนับและยังไม่มีบิล กรุณายกเลิกการนับแล้วจัดการก่อน', 'QR_PAYMENT_UNRESOLVED')
    const deltas = await this.shifts.cashDeltas(id)
    const expected = shift.expectedCashSatang(deltas)
    if (shift.closingExpectedCashSatang !== expected)
      throw new DomainConflictError('ยอดเงินสดเปลี่ยนหลังเริ่มนับ กรุณายกเลิกแล้วเริ่มนับใหม่', 'SHIFT_CASH_CHANGED_DURING_CLOSING')
    const closing = new ShiftEntity({ ...shift.toSnapshot(), closingExpectedCashSatang: expected })
    const result = await this.shifts.update(
      closing.close(dto.closingRevision, dto.countedCashSatang, dto.reason ?? '', actor.id, actor.displayName, this.clock.now()),
    )
    if (actor.id !== shift.closingStartedById) await this.audit.record({ id: actor.id, name: actor.displayName }, branchId, buildAuditEntry({
      action: 'shift.override_close',
      entityType: 'shift',
      entityId: String(id),
      summary: 'ยืนยันปิดกะแทนผู้เริ่มนับ',
      before: { status: shift.status, closingStartedById: shift.closingStartedById },
      after: { status: result.status },
      reason: dto.reason,
    }))
    return result
  }
}
