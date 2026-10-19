import { injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import type { IShiftSettingsGuard } from '../../applications/ports/shift-settings-guard.port'
import { MemoryShiftRepository } from './shift.memory.repository'

/**
 * Blocks currency changes while any drawer is open or being counted. Reads
 * the shifts' own memory store; the demo composition root must hand this
 * the same MemoryShiftRepository singleton the shift token gets.
 */
@injectable()
export class MemoryShiftSettingsGuard implements IShiftSettingsGuard {
  constructor(private readonly shifts: MemoryShiftRepository) {}

  async assertCurrencyChangeAllowed() {
    if (await this.shifts.hasOpenOrClosing())
      throw new DomainConflictError('เปลี่ยนสกุลเงินไม่ได้ขณะที่ยังมีกะเปิดหรือนับเงินอยู่', 'SHIFT_CURRENCY_CHANGE_BLOCKED')
  }
}
