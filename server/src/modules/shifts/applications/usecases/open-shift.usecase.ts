import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { ShiftEntity } from '../../../../domains/shift.domain'
import { shopSettingsRepositoryToken } from '../../../settings/applications/ports/shop-settings.repository'
import type { IShopSettingsRepository } from '../../../settings/applications/ports/shop-settings.repository'
import { TOKENS } from '../../../tokens'
import type { IClock } from '../../../shared/ports/clock.port'
import type { ICheckoutPolicy } from '../../../shared/ports/checkout-policy.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { CommandIdempotency } from '../../../shared/applications/command-idempotency'
import { registerRepositoryToken } from '../ports/register.repository'
import type { IRegisterRepository } from '../ports/register.repository'
import { shiftRepositoryToken } from '../ports/shift.repository'
import type { IShiftRepository } from '../ports/shift.repository'
import { openShiftSchema } from '../schemas/shift-schemas'
import { restoreShiftSnapshot } from '../shift-snapshot'

interface Actor { id: number; displayName: string }

/** Command. */
@injectable()
export class OpenShiftUseCase {
  constructor(
    @inject(TOKENS.CheckoutPolicy) private readonly policy: ICheckoutPolicy,
    @inject(shopSettingsRepositoryToken) private readonly settings: IShopSettingsRepository,
    @inject(registerRepositoryToken) private readonly registers: IRegisterRepository,
    @inject(shiftRepositoryToken) private readonly shifts: IShiftRepository,
    @inject(TOKENS.UnitOfWork) private readonly uow: IUnitOfWork,
    @inject(TOKENS.Clock) private readonly clock: IClock,
    @inject(TOKENS.Idempotency) private readonly idempotency: CommandIdempotency,
  ) {}

  async execute(input: unknown, actor: Actor, branchId: number, idempotencyKey: string) {
    const dto = openShiftSchema.parse(input)
    if (!await this.policy.isShiftsEnabled()) throw new DomainConflictError('เปิดใช้กะได้เมื่อ CHECKOUT_MODE=shifts', 'CHECKOUT_MODE_REQUIRED')
    return this.uow.run(() => this.idempotency.execute(
      { actorId: actor.id, branchId, action: 'shifts.open', key: idempotencyKey },
      dto,
      () => this.open(dto, actor, branchId),
      (shift) => shift.toSnapshot(),
      async (snapshot) => restoreShiftSnapshot(snapshot),
    ))
  }

  private async open(dto: ReturnType<typeof openShiftSchema.parse>, actor: Actor, branchId: number): Promise<ShiftEntity> {
    const settings = await this.settings.getForUpdate()
    const register = await this.registers.findByIdForUpdate(dto.registerId, branchId)
    if (!register) throw new DomainNotFoundError('ไม่พบจุดขาย', 'REGISTER_NOT_FOUND')
    if (!register.isActive) throw new DomainConflictError('จุดขายนี้ปิดใช้งานแล้ว', 'REGISTER_INACTIVE')
    if (await this.shifts.findCurrentByRegister(register.id, branchId))
      throw new DomainConflictError('จุดขายนี้มีกะที่ยังไม่ปิด', 'SHIFT_ALREADY_OPEN')
    const opened = await this.shifts.create(new ShiftEntity({
      id: 0,
      branchId,
      registerId: register.id,
      status: 'open',
      openedAt: this.clock.now(),
      openedById: actor.id,
      openedByName: actor.displayName,
      openingCashSatang: dto.openingCashSatang,
      openingNote: dto.openingNote?.trim() || null,
      currency: settings.currency,
      timeZone: settings.timeZone,
      closingRevision: 0,
      closingStartedAt: null,
      closingStartedById: null,
      closingStartedByName: null,
      closingExpectedCashSatang: null,
      closedAt: null,
      closedById: null,
      closedByName: null,
      countedCashSatang: null,
      cashDifferenceSatang: null,
      differenceReason: null,
    }))
    await this.policy.activateShifts()
    return opened
  }
}
