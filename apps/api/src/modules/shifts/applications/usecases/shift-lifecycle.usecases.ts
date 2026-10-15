import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { ShiftEntity } from '../../../../domains/shift.domain'
import { buildShiftSummary } from '../../../../domains/shift-summary'
import { ShiftCashEntryEntity } from '../../../../domains/shift-cash-entry.domain'
import { TOKENS } from '../../../tokens'
import type { IClock } from '../../../shared/ports/clock.port'
import type { ICheckoutPolicy } from '../../../shared/ports/checkout-policy.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { CommandIdempotency } from '../../../shared/applications/command-idempotency'
import { registerRepositoryToken } from '../ports/register.repository'
import type { IRegisterRepository } from '../ports/register.repository'
import { shiftRepositoryToken } from '../ports/shift.repository'
import type { IShiftRepository } from '../ports/shift.repository'
import { qrShiftReadinessToken } from '../../../qr-payments/applications/ports/qr-shift-readiness.port'
import type { IQrShiftReadiness } from '../../../qr-payments/applications/ports/qr-shift-readiness.port'
import { shiftSalesTotalsToken } from '../../../sales/applications/ports/shift-sales-totals.port'
import type { IShiftSalesTotals } from '../../../sales/applications/ports/shift-sales-totals.port'
import { shiftSummaryRepositoryToken } from '../ports/shift-summary.repository'
import type { IShiftSummaryRepository } from '../ports/shift-summary.repository'
import { cashEntryListSchema, cashMovementSchema, closeShiftSchema, shiftListSchema, shiftRevisionSchema, startClosingSchema } from '../schemas/shift-schemas'
import { restoreCashEntrySnapshot, restoreShiftSnapshot } from '../shift-snapshot'

interface Actor { id: number; displayName: string; role: 'owner' | 'cashier' }

/** Query. */
@injectable()
export class GetShiftUseCase {
  constructor(@inject(shiftRepositoryToken) private readonly shifts: IShiftRepository) {}
  async execute(id: number, branchId: number) {
    const shift = await this.shifts.findById(id, branchId)
    if (!shift) throw new DomainNotFoundError('ไม่พบกะ', 'SHIFT_NOT_FOUND')
    return shift
  }
}

/** Query. */
@injectable()
export class GetCurrentShiftUseCase {
  constructor(
    @inject(shiftRepositoryToken) private readonly shifts: IShiftRepository,
    @inject(registerRepositoryToken) private readonly registers: IRegisterRepository,
  ) {}
  async execute(registerId: number, branchId: number) {
    if (!(await this.registers.findById(registerId, branchId))) throw new DomainNotFoundError('ไม่พบจุดขาย', 'REGISTER_NOT_FOUND')
    return this.shifts.findCurrentByRegister(registerId, branchId)
  }
}

/** Query. */
@injectable()
export class ListShiftsUseCase {
  constructor(@inject(shiftRepositoryToken) private readonly shifts: IShiftRepository) {}
  execute(input: unknown, branchId: number) {
    const dto = shiftListSchema.parse(input)
    return this.shifts.list({ ...dto, branchId })
  }
}

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
  async execute(id: number, input: unknown, actor: Actor, branchId: number, idempotencyKey: string) {
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

/** Command. */
@injectable()
export class CancelShiftClosingUseCase {
  constructor(
    @inject(TOKENS.CheckoutPolicy) private readonly policy: ICheckoutPolicy,
    @inject(shiftRepositoryToken) private readonly shifts: IShiftRepository,
    @inject(TOKENS.UnitOfWork) private readonly uow: IUnitOfWork,
    @inject(TOKENS.Idempotency) private readonly idempotency: CommandIdempotency,
    @inject(shiftSummaryRepositoryToken) private readonly summaries: IShiftSummaryRepository,
  ) {}
  async execute(id: number, input: unknown, actor: Actor, branchId: number, idempotencyKey: string) {
    const dto = shiftRevisionSchema.parse(input)
    if (!await this.policy.isShiftsEnabled()) throw new DomainConflictError('ยกเลิกการนับกะได้เมื่อ CHECKOUT_MODE=shifts', 'CHECKOUT_MODE_REQUIRED')
    return this.uow.run(() => this.idempotency.execute(
      { actorId: actor.id, branchId, action: 'shifts.cancel-closing', key: idempotencyKey },
      dto,
      async () => {
      const shift = await this.shifts.findByIdForUpdate(id, branchId)
      if (!shift) throw new DomainNotFoundError('ไม่พบกะ', 'SHIFT_NOT_FOUND')
      if (actor.role !== 'owner' && actor.id !== shift.closingStartedById)
        throw new DomainConflictError('เฉพาะผู้เริ่มนับหรือเจ้าของร้านยกเลิกการนับได้', 'SHIFT_CLOSING_OWNER_REQUIRED')
      const reopened = await this.shifts.update(shift.cancelClosing(dto.closingRevision))
      // The shift sells again, so the summary of the abandoned count no longer describes it.
      await this.summaries.discard(id)
      return reopened
      },
      (shift) => shift.toSnapshot(),
      async (snapshot) => restoreShiftSnapshot(snapshot),
    ))
  }
}

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
  ) {}
  async execute(id: number, input: unknown, actor: Actor, branchId: number, idempotencyKey: string) {
    const dto = closeShiftSchema.parse(input)
    if (!await this.policy.isShiftsEnabled()) throw new DomainConflictError('ปิดกะได้เมื่อ CHECKOUT_MODE=shifts', 'CHECKOUT_MODE_REQUIRED')
    return this.uow.run(() => this.idempotency.execute(
      { actorId: actor.id, branchId, action: 'shifts.close', key: idempotencyKey },
      dto,
      async () => {
      const shift = await this.shifts.findByIdForUpdate(id, branchId)
      if (!shift) throw new DomainNotFoundError('ไม่พบกะ', 'SHIFT_NOT_FOUND')
      if (actor.role !== 'owner' && actor.id !== shift.closingStartedById)
        throw new DomainConflictError('เฉพาะผู้เริ่มนับหรือเจ้าของร้านยืนยันปิดกะได้', 'SHIFT_CLOSING_OWNER_REQUIRED')
      // The bank may have confirmed a payment while the drawer was being counted.
      if ((await this.qrReadiness.forShift(id)).paidUnclaimed > 0)
        throw new DomainConflictError('มีเงินจาก QR เข้ามาระหว่างนับและยังไม่มีบิล กรุณายกเลิกการนับแล้วจัดการก่อน', 'QR_PAYMENT_UNRESOLVED')
      const deltas = await this.shifts.cashDeltas(id)
      const expected = shift.expectedCashSatang(deltas)
      if (shift.closingExpectedCashSatang !== expected)
        throw new DomainConflictError('ยอดเงินสดเปลี่ยนหลังเริ่มนับ กรุณายกเลิกแล้วเริ่มนับใหม่', 'SHIFT_CASH_CHANGED_DURING_CLOSING')
      const closing = new ShiftEntity({ ...shift.toSnapshot(), closingExpectedCashSatang: expected })
      return this.shifts.update(
        closing.close(dto.closingRevision, dto.countedCashSatang, dto.reason ?? '', actor.id, actor.displayName, this.clock.now()),
      )
      },
      (shift) => shift.toSnapshot(),
      async (snapshot) => restoreShiftSnapshot(snapshot),
    ))
  }
}

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
  async execute(shiftId: number, input: unknown, actor: Actor, branchId: number, idempotencyKey: string) {
    const dto = cashMovementSchema.parse(input)
    if (!await this.policy.isShiftsEnabled()) throw new DomainConflictError('บันทึกเงินสดได้เมื่อ CHECKOUT_MODE=shifts', 'CHECKOUT_MODE_REQUIRED')
    return this.uow.run(() => this.idempotency.execute(
      { actorId: actor.id, branchId, action: 'shifts.cash-movement', key: idempotencyKey },
      { shiftId, ...dto },
      async () => {
      const shift = await this.shifts.findByIdForUpdate(shiftId, branchId)
      if (!shift) throw new DomainNotFoundError('ไม่พบกะ', 'SHIFT_NOT_FOUND')
      if (shift.status !== 'open') throw new DomainConflictError('บันทึกเงินสดได้เฉพาะกะที่เปิดอยู่', 'SHIFT_NOT_OPEN')
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

/** Query. */
@injectable()
export class ListShiftCashEntriesUseCase {
  constructor(@inject(shiftRepositoryToken) private readonly shifts: IShiftRepository) {}
  async execute(shiftId: number, input: unknown, branchId: number) {
    const dto = cashEntryListSchema.parse(input)
    if (!(await this.shifts.findById(shiftId, branchId))) throw new DomainNotFoundError('ไม่พบกะ', 'SHIFT_NOT_FOUND')
    return this.shifts.listCashEntries(shiftId, dto.limit, dto.offset)
  }
}
