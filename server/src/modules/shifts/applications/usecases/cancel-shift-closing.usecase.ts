import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { auditLogToken, type IAuditLog } from '../../../audit/applications/ports/audit-log.port'
import { canDo } from '../../../../domains/authorization'
import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { TOKENS } from '../../../tokens'
import type { ICheckoutPolicy } from '../../../shared/ports/checkout-policy.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { CommandIdempotency } from '../../../shared/applications/command-idempotency'
import { shiftRepositoryToken } from '../ports/shift.repository'
import type { IShiftRepository } from '../ports/shift.repository'
import { shiftSummaryRepositoryToken } from '../ports/shift-summary.repository'
import type { IShiftSummaryRepository } from '../ports/shift-summary.repository'
import { shiftRevisionSchema } from '../schemas/shift-schemas'
import { restoreShiftSnapshot } from '../shift-snapshot'
import type { ShiftActor } from '../shift-actor'

/** Command. */
@injectable()
export class CancelShiftClosingUseCase {
  constructor(
    @inject(TOKENS.CheckoutPolicy) private readonly policy: ICheckoutPolicy,
    @inject(shiftRepositoryToken) private readonly shifts: IShiftRepository,
    @inject(TOKENS.UnitOfWork) private readonly uow: IUnitOfWork,
    @inject(TOKENS.Idempotency) private readonly idempotency: CommandIdempotency,
    @inject(shiftSummaryRepositoryToken) private readonly summaries: IShiftSummaryRepository,
    @inject(auditLogToken) private readonly audit: IAuditLog,
  ) { }
  async execute(id: number, input: unknown, actor: ShiftActor, branchId: number, idempotencyKey: string) {
    const dto = shiftRevisionSchema.parse(input)
    if (!await this.policy.isShiftsEnabled()) throw new DomainConflictError('ยกเลิกการนับกะได้เมื่อ CHECKOUT_MODE=shifts', 'CHECKOUT_MODE_REQUIRED')
    return this.uow.run(() => this.idempotency.execute(
      { actorId: actor.id, branchId, action: 'shifts.cancel-closing', key: idempotencyKey },
      dto,
      async () => {
        const shift = await this.shifts.findByIdForUpdate(id, branchId)
        if (!shift) throw new DomainNotFoundError('ไม่พบกะ', 'SHIFT_NOT_FOUND')
        if (!canDo(actor, 'shifts.override') && actor.id !== shift.closingStartedById)
          throw new DomainConflictError('เฉพาะผู้เริ่มนับหรือเจ้าของร้านยกเลิกการนับได้', 'SHIFT_CLOSING_OWNER_REQUIRED')
        const reopened = await this.shifts.update(shift.cancelClosing(dto.closingRevision))
        // The shift sells again, so the summary of the abandoned count no longer describes it.
        await this.summaries.discard(id)
        if (actor.id !== shift.closingStartedById) await this.audit.record({ id: actor.id, name: actor.displayName }, branchId, buildAuditEntry({
          action: 'shift.override_close',
          entityType: 'shift',
          entityId: String(id),
          summary: 'ยกเลิกการนับกะแทนผู้เริ่มนับ',
          before: { status: shift.status, closingStartedById: shift.closingStartedById },
          after: { status: reopened.status },
        }))
        return reopened
      },
      (shift) => shift.toSnapshot(),
      async (snapshot) => restoreShiftSnapshot(snapshot),
    ))
  }
}
