import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { buildShiftSummary, voidedAfterCutoff } from '../../../../domains/shift-summary'
import { shiftSalesTotalsToken } from '../../../sales/applications/ports/shift-sales-totals.port'
import type { IShiftSalesTotals } from '../../../sales/applications/ports/shift-sales-totals.port'
import { shiftRepositoryToken } from '../ports/shift.repository'
import type { IShiftRepository } from '../ports/shift.repository'
import { shiftSummaryRepositoryToken } from '../ports/shift-summary.repository'
import type { IShiftSummaryRepository } from '../ports/shift-summary.repository'

/**
 * Query: the report of a shift. An open shift is worked out as of now. A shift being counted or closed
 * answers the summary frozen when counting started, with sales voided since then reported beside it.
 */
@injectable()
export class GetShiftSummaryUseCase {
  constructor(
    @inject(shiftRepositoryToken) private readonly shifts: IShiftRepository,
    @inject(shiftSummaryRepositoryToken) private readonly summaries: IShiftSummaryRepository,
    @inject(shiftSalesTotalsToken) private readonly salesTotals: IShiftSalesTotals,
  ) {}

  async execute(shiftId: number, branchId: number) {
    const shift = await this.shifts.findById(shiftId, branchId)
    if (!shift) throw new DomainNotFoundError('ไม่พบกะ', 'SHIFT_NOT_FOUND')

    const sales = await this.salesTotals.forShift(shiftId)
    const frozen = await this.summaries.findFrozen(shiftId)
    if (frozen)
      return {
        frozen: true,
        capturedAt: frozen.capturedAt,
        summary: frozen.summary,
        voidedAfterCutoff: voidedAfterCutoff(frozen.summary, sales),
      }

    return {
      frozen: false,
      capturedAt: null,
      summary: buildShiftSummary(shift.openingCashSatang, sales, await this.summaries.cashTotals(shiftId)),
      voidedAfterCutoff: { count: 0, amountSatang: 0 },
    }
  }
}
