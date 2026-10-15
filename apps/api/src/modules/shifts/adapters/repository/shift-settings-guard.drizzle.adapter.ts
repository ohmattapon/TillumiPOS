import { inArray } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { shifts } from '../../../../infrastructure/database/schema/shifts'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IShiftSettingsGuard } from '../../applications/ports/shift-settings-guard.port'

@injectable()
export class DrizzleShiftSettingsGuard implements IShiftSettingsGuard {
  async assertCurrencyChangeAllowed() {
    const [active] = await currentExecutor()
      .select({ id: shifts.id })
      .from(shifts)
      .where(inArray(shifts.status, ['open', 'closing']))
      .limit(1)
    if (active) throw new DomainConflictError('เปลี่ยนสกุลเงินไม่ได้ขณะที่ยังมีกะเปิดหรือนับเงินอยู่', 'SHIFT_CURRENCY_CHANGE_BLOCKED')
  }
}
