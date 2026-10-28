import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { ShiftCashEntryEntity } from '../../../../domains/shift-cash-entry.domain'
import { TOKENS } from '../../../tokens'
import type { IClock } from '../../../shared/ports/clock.port'
import type { ICheckoutPolicy } from '../../../shared/ports/checkout-policy.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { CommandIdempotency } from '../../../shared/applications/command-idempotency'
import { shiftRepositoryToken } from '../ports/shift.repository'
import type { IShiftRepository } from '../ports/shift.repository'
import { cashMovementSchema } from '../schemas/shift-schemas'
import { restoreCashEntrySnapshot } from '../shift-snapshot'
import type { ShiftActor } from '../shift-actor'

/** Command. */
@injectable()
export class RecordCashMovementUseCase {
  constructor(
    @inject(TOKENS.CheckoutPolicy) private readonly policy: ICheckoutPolicy,
    @inject(shiftRepositoryToken) private readonly shifts: IShiftRepository,
    @inject(TOKENS.UnitOfWork) private readonly uow: IUnitOfWork,
    @inject(TOKENS.Clock) private readonly clock: IClock,
    @inject(TOKENS.Idempotency) private readonly idempotency: CommandIdempotency,
  ) {}
  async execute(shiftId: number, input: unknown, actor: ShiftActor, branchId: number, idempotencyKey: string) {
    const dto = cashMovementSchema.parse(input)
    if (!await this.policy.isShiftsEnabled()) throw new DomainConflictError('บันทึกเงินสดได้เมื่อ CHECKOUT_MODE=shifts', 'CHECKOUT_MODE_REQUIRED')
    return this.uow.run(() => this.idempotency.execute(
      { actorId: actor.id, branchId, action: 'shifts.cash-movement', key: idempotencyKey },
      { shiftId, ...dto },
      async () => {
      const shift = await this.shifts.findByIdForUpdate(shiftId, branchId)
      if (!shift) throw new DomainNotFoundError('ไม่พบกะ', 'SHIFT_NOT_FOUND')
      shift.assertOpen()
      const deltas = await this.shifts.cashDeltas(shiftId)
      const entry = new ShiftCashEntryEntity({
        id: 0,
        shiftId,
        kind: dto.kind,
        amountSatang: dto.amountSatang,
        saleId: null,
        actorId: actor.id,
        actorName: actor.displayName,
        reason: dto.reason,
        createdAt: this.clock.now(),
      })
      shift.expectedCashSatang([...deltas, { amountSatang: entry.signedDeltaSatang }])
      return this.shifts.addCashEntry(entry)
      },
      (entry) => entry.toSnapshot(),
      async (snapshot) => restoreCashEntrySnapshot(snapshot),
    ))
  }
}
