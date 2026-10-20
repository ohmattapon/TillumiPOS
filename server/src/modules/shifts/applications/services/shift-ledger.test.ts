import { describe, expect, test } from 'bun:test'
import { makeShift } from '../../../../__tests__/factories'
import { mockShiftRepository } from '../../../../__tests__/mocks'
import { ShiftLedger } from './shift-ledger'

const sale = { shiftId: 7, branchId: 1, saleId: 40, receiptNo: 'MAIN-1', actorId: 3, actorName: 'ผู้ขาย', amountSatang: 1000, createdAt: new Date('2026-10-13T03:00:00Z') }
const refund = { shiftId: 7, branchId: 1, saleId: 40, actorId: 3, actorName: 'ผู้ขาย', amountSatang: 1000, reason: 'คืนเงิน', createdAt: new Date('2026-10-13T04:00:00Z') }

const setup = (shift = makeShift({ id: 7, openingCashSatang: 0 })) => {
  const shifts = mockShiftRepository()
  shifts.findByIdForUpdate.mockResolvedValue(shift)
  shifts.cashDeltas.mockResolvedValue([])
  shifts.hasCashRefund.mockResolvedValue(false)
  shifts.addCashEntry.mockImplementation(async (entry) => entry)
  return { shifts, ledger: new ShiftLedger(shifts) }
}

describe('ShiftLedger.assertOpenForCheckout', () => {
  test('accepts an open shift of the branch, locking it', async () => {
    const { shifts, ledger } = setup()
    await ledger.assertOpenForCheckout(7, 1)
    expect(shifts.findByIdForUpdate).toHaveBeenCalledWith(7, 1)
  })

  test('a shift that is missing, or of another branch, is not found', async () => {
    const { shifts, ledger } = setup()
    shifts.findByIdForUpdate.mockResolvedValue(null)
    await expect(ledger.assertOpenForCheckout(7, 2)).rejects.toMatchObject({ code: 'SHIFT_NOT_FOUND' })
  })

  test('a shift that is being counted takes no payment', async () => {
    const { ledger } = setup(makeShift({ id: 7, status: 'closing', closingRevision: 1, closingExpectedCashSatang: 0 }))
    await expect(ledger.assertOpenForCheckout(7, 1)).rejects.toMatchObject({ code: 'SHIFT_NOT_OPEN' })
  })
})

describe('ShiftLedger.recordSaleCash', () => {
  test('writes one cash_sale entry for the sale', async () => {
    const { shifts, ledger } = setup()
    await ledger.recordSaleCash(sale)
    expect(shifts.addCashEntry).toHaveBeenCalledTimes(1)
    expect(shifts.addCashEntry.mock.calls[0]![0].toSnapshot()).toMatchObject({ shiftId: 7, kind: 'cash_sale', amountSatang: 1000, saleId: 40 })
  })

  test('writes nothing when the sale took no cash', async () => {
    const { shifts, ledger } = setup()
    await ledger.recordSaleCash({ ...sale, amountSatang: 0 })
    expect(shifts.findByIdForUpdate).not.toHaveBeenCalled()
    expect(shifts.addCashEntry).not.toHaveBeenCalled()
  })

  test('refuses cash that would push the drawer past what the system can count', async () => {
    const { shifts, ledger } = setup()
    shifts.cashDeltas.mockResolvedValue([{ amountSatang: 2_000_000_000 }])
    await expect(ledger.recordSaleCash({ ...sale, amountSatang: 200_000_000 })).rejects.toMatchObject({ code: 'AMOUNT_TOO_LARGE' })
    expect(shifts.addCashEntry).not.toHaveBeenCalled()
  })

  test('a closed shift takes no cash', async () => {
    const { shifts, ledger } = setup(makeShift({ id: 7, status: 'closed' }))
    await expect(ledger.recordSaleCash(sale)).rejects.toMatchObject({ code: 'SHIFT_NOT_OPEN' })
    expect(shifts.addCashEntry).not.toHaveBeenCalled()
  })
})

describe('ShiftLedger.recordSaleRefund', () => {
  test('writes one cash_refund entry when the drawer holds enough', async () => {
    const { shifts, ledger } = setup()
    shifts.cashDeltas.mockResolvedValue([{ amountSatang: 1000 }])
    await ledger.recordSaleRefund(refund)
    expect(shifts.addCashEntry.mock.calls[0]![0].toSnapshot()).toMatchObject({ kind: 'cash_refund', amountSatang: 1000, saleId: 40, reason: 'คืนเงิน' })
  })

  test('rejects an amount that is not a whole positive number of satang', async () => {
    const { shifts, ledger } = setup()
    await expect(ledger.recordSaleRefund({ ...refund, amountSatang: 0 })).rejects.toMatchObject({ code: 'INVALID_CASH_REFUND' })
    await expect(ledger.recordSaleRefund({ ...refund, amountSatang: 1.5 })).rejects.toMatchObject({ code: 'INVALID_CASH_REFUND' })
    expect(shifts.findByIdForUpdate).not.toHaveBeenCalled()
  })

  test('a sale is refunded once', async () => {
    const { shifts, ledger } = setup()
    shifts.hasCashRefund.mockResolvedValue(true)
    await expect(ledger.recordSaleRefund(refund)).rejects.toMatchObject({ code: 'SALE_ALREADY_REFUNDED' })
    expect(shifts.addCashEntry).not.toHaveBeenCalled()
  })

  test('refuses to hand back more cash than the drawer holds', async () => {
    const { shifts, ledger } = setup()
    shifts.cashDeltas.mockResolvedValue([{ amountSatang: 999 }])
    await expect(ledger.recordSaleRefund(refund)).rejects.toMatchObject({ code: 'SHIFT_CASH_INSUFFICIENT' })
    expect(shifts.addCashEntry).not.toHaveBeenCalled()
  })

  test('only an open shift pays refunds', async () => {
    const { ledger } = setup(makeShift({ id: 7, status: 'closed' }))
    await expect(ledger.recordSaleRefund(refund)).rejects.toMatchObject({ code: 'SHIFT_NOT_OPEN' })
  })
})
